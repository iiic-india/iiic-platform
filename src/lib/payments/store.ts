import { sql } from '@payloadcms/db-postgres'
import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  type Payload,
  type PayloadRequest,
} from 'payload'

import { recordAudit } from '@/lib/audit/record'

import type { ParsedGatewayEvent } from './webhookEvent'

/**
 * The payments module's own database steps (docs/16 §5), where Payload's API has no word for
 * them: a transaction the caller may or may not already hold, a savepoint around the booking's
 * confirmation (whose exclusion constraint aborts a transaction it refuses), row locks that keep
 * two writers to one payment in line, and the once-only claim of a gateway event against its
 * unique (gateway, event_id) index. Everything runs on the request's own transaction connection,
 * as @payloadcms/drizzle's getTransaction finds it. No query here carries a payload or a name.
 * The collections' hooks reach it, so it stays free of `server-only` (src/lib/env.ts says why).
 */

type Query = ReturnType<typeof sql>
type Executor = { execute: (query: Query) => Promise<{ rows: unknown[] }> }

/** The request's transaction connection, or the pool when it has none. */
async function executorOf(req: PayloadRequest): Promise<Executor> {
  const adapter = req.payload.db
  const transactionID = await req.transactionID
  const session =
    transactionID !== undefined && transactionID !== null
      ? adapter.sessions?.[transactionID]?.db
      : undefined
  return (session ?? adapter.drizzle) as unknown as Executor
}

export async function execute(req: PayloadRequest, query: Query): Promise<unknown[]> {
  const result = await (await executorOf(req)).execute(query)
  return result.rows
}

/**
 * Runs `work` in the request's transaction: one it opens and then commits (or rolls back on a
 * throw), or the caller's, which the caller commits.
 */
export async function inTransaction<T>(req: PayloadRequest, work: () => Promise<T>): Promise<T> {
  const owned = await initTransaction(req)
  try {
    const value = await work()
    if (owned) await commitTransaction(req)
    return value
  } catch (error) {
    if (owned) await killTransaction(req)
    throw error
  }
}

/** A request of its own, for work that must commit apart from the caller's (a gateway call). */
export function freshRequest(
  payload: Payload,
  user?: PayloadRequest['user'],
): Promise<PayloadRequest> {
  return createLocalReq({ user: user ?? undefined }, payload)
}

/** Postgres's SQLSTATE behind an error, however deep Payload and Drizzle wrapped it. */
export function sqlStateOf(error: unknown): string | undefined {
  let current: unknown = error
  for (let depth = 0; depth < 6 && current; depth += 1) {
    const code = (current as { code?: unknown }).code
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code
    current = (current as { cause?: unknown }).cause
  }
  return undefined
}

/** SQLSTATE for a write the exclusion constraint refused (docs/16 §4). */
export const EXCLUSION_VIOLATION = '23P01'

const SAVEPOINTS = { confirm: 'payments_confirm_booking' } as const

/**
 * Runs `work` under a savepoint inside the caller's transaction and keeps it only when `keep`
 * says so: a refusal (the slot was taken) is rolled back to the savepoint, so the transaction
 * stays usable for the refund that follows. A throw is rolled back to the savepoint too, then
 * passed on.
 */
export async function inSavepoint<T>(
  req: PayloadRequest,
  name: keyof typeof SAVEPOINTS,
  work: () => Promise<T>,
  keep: (value: T) => boolean,
): Promise<T> {
  const point = sql.raw(SAVEPOINTS[name])
  await execute(req, sql`SAVEPOINT ${point}`)
  try {
    const value = await work()
    await execute(
      req,
      keep(value) ? sql`RELEASE SAVEPOINT ${point}` : sql`ROLLBACK TO SAVEPOINT ${point}`,
    )
    return value
  } catch (error) {
    await execute(req, sql`ROLLBACK TO SAVEPOINT ${point}`)
    throw error
  }
}

const LOCKS = {
  payments: sql`SELECT "id" FROM "payments" WHERE "id" = `,
  refunds: sql`SELECT "id" FROM "refunds" WHERE "id" = `,
  bookings: sql`SELECT "id" FROM "bookings" WHERE "id" = `,
} as const

/**
 * Locks one row until the transaction ends, so two writers to one payment, refund or booking
 * take turns: the second reads what the first committed. False when the row does not exist.
 */
export async function lockRow(
  req: PayloadRequest,
  table: keyof typeof LOCKS,
  id: number,
): Promise<boolean> {
  const rows = await execute(req, sql`${LOCKS[table]}${id} FOR UPDATE`)
  return rows.length === 1
}

/**
 * Claims an event once, in the caller's transaction (docs/16 §5): inserts its row under the
 * unique (gateway, event_id) index and returns the row's id, or null when that event is already
 * there. A concurrent duplicate waits on the index until the first commits, then finds it there
 * (a replay) without aborting its own transaction; if the first rolls back, the second claims it.
 * The outcome written here is provisional; the caller sets the real one before it commits.
 */
export async function claimGatewayEvent(
  req: PayloadRequest,
  /** A gateway event, or a finding of the reconciliation's under a type of its own. */
  event: Omit<ParsedGatewayEvent, 'type'> & { type: string },
  source: 'webhook' | 'poll' | 'reconciliation',
  receivedAt: Date,
): Promise<number | null> {
  const rows = (await execute(
    req,
    sql`INSERT INTO "gateway_events"
          ("gateway", "event_id", "type", "source", "gateway_order_id", "gateway_payment_link_id",
           "gateway_payment_id", "gateway_refund_id", "amount_paise", "received_at", "outcome")
        VALUES ('razorpay', ${event.eventId}, ${event.type}, ${source}, ${event.gatewayOrderId},
                ${event.gatewayPaymentLinkId}, ${event.gatewayPaymentId}, ${event.gatewayRefundId},
                ${event.amountPaise}, ${receivedAt.toISOString()}, 'processed')
        ON CONFLICT ("gateway", "event_id") DO NOTHING
        RETURNING "id"`,
  )) as { id: number | string }[]
  const id = rows[0]?.id
  if (id === undefined) return null
  // Written past Payload's API, so its audit entry is written here, in the same transaction.
  await recordAudit(req, { action: 'create', entity: 'gateway-events', entityId: id }, null)
  return Number(id)
}
