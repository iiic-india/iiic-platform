import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { PayloadRequest } from 'payload'

import type { AutomationId } from '@/lib/automations/catalogue'

import { canMove, CANCELLABLE_STATUSES } from './states'
import type { MessageStatus, SkipReason, Subject } from './types'

/**
 * The outbox's moves, as conditional updates (docs/19 §2, §3): a message moves only from the
 * status it was read in, in one statement, so two runners never both claim one message and a late
 * provider report never moves one back (src/lib/messaging/states.ts). Payload's API has no word
 * for "update where it is still queued", so these few statements are SQL, on the request's own
 * transaction connection when it has one. No statement carries a body, an address or a name.
 */

type Query = ReturnType<typeof sql>
type Executor = { execute: (query: Query) => Promise<{ rows: unknown[] }> }

async function executorOf(req: PayloadRequest): Promise<Executor> {
  const adapter = req.payload.db
  const transactionID = await req.transactionID
  const session =
    transactionID !== undefined && transactionID !== null
      ? adapter.sessions?.[transactionID]?.db
      : undefined
  return (session ?? adapter.drizzle) as unknown as Executor
}

async function rows<T>(req: PayloadRequest, query: Query): Promise<T[]> {
  const result = await (await executorOf(req)).execute(query)
  return result.rows as T[]
}

/** Whether the request is inside a transaction the caller opened (it commits it, not us). */
export async function inCallersTransaction(req: PayloadRequest): Promise<boolean> {
  const id = await req.transactionID
  return id !== undefined && id !== null
}

/** Claims a due message for sending: queued → sending, one more try. Null if another has it. */
export async function claim(
  req: PayloadRequest,
  id: number,
  now: Date,
): Promise<{ id: number; attempts: number } | null> {
  const found = await rows<{ id: number; attempts: number | null }>(
    req,
    sql`UPDATE "messages" SET "status" = 'sending', "claimed_at" = ${now.toISOString()},
      "attempts" = COALESCE("attempts", 0) + 1, "updated_at" = ${now.toISOString()}
      WHERE "id" = ${id} AND "status" = 'queued' AND "send_at" <= ${now.toISOString()}
      RETURNING "id", "attempts"`,
  )
  const row = found[0]
  return row ? { id: Number(row.id), attempts: Number(row.attempts ?? 1) } : null
}

/** What a move may also write, besides the status. */
export type MoveFields = {
  sendAt?: Date
  skipReason?: SkipReason | null
  lastError?: string | null
  sentAt?: Date
  deliveredAt?: Date
  readAt?: Date
  provider?: 'resend' | 'aisensy' | 'fake'
  providerMessageId?: string
  /** A deferral is not a try: the claim's count is taken back. */
  uncountTry?: boolean
  resetAttempts?: boolean
}

/**
 * Moves a message from one of `from` to `to`, writing `fields`, only while it is still in one of
 * them; true when it moved. Every pair must be a move of the state table.
 */
export async function move(
  req: PayloadRequest,
  id: number,
  from: readonly MessageStatus[],
  to: MessageStatus,
  fields: MoveFields,
  now: Date,
): Promise<boolean> {
  const allowed = from.filter((status) => canMove(status, to))
  if (!allowed.length) return false
  const sets = [sql`"status" = ${to}`, sql`"updated_at" = ${now.toISOString()}`]
  if (fields.sendAt) sets.push(sql`"send_at" = ${fields.sendAt.toISOString()}`)
  if (fields.skipReason !== undefined) sets.push(sql`"skip_reason" = ${fields.skipReason}`)
  if (fields.lastError !== undefined) sets.push(sql`"last_error" = ${fields.lastError}`)
  if (fields.sentAt) sets.push(sql`"sent_at" = ${fields.sentAt.toISOString()}`)
  if (fields.deliveredAt) sets.push(sql`"delivered_at" = ${fields.deliveredAt.toISOString()}`)
  if (fields.readAt) sets.push(sql`"read_at" = ${fields.readAt.toISOString()}`)
  if (fields.provider) sets.push(sql`"provider" = ${fields.provider}`)
  if (fields.providerMessageId) {
    sets.push(sql`"provider_message_id" = ${fields.providerMessageId}`)
  }
  if (fields.uncountTry) sets.push(sql`"attempts" = GREATEST(COALESCE("attempts", 1) - 1, 0)`)
  if (fields.resetAttempts) sets.push(sql`"attempts" = 0`)
  const statuses = sql.join(
    allowed.map((status) => sql`${status}`),
    sql`, `,
  )
  const moved = await rows<{ id: number }>(
    req,
    sql`UPDATE "messages" SET ${sql.join(sets, sql`, `)}
      WHERE "id" = ${id} AND "status" IN (${statuses}) RETURNING "id"`,
  )
  return moved.length > 0
}

/** The due queued messages, oldest first. */
export async function dueMessages(
  req: PayloadRequest,
  now: Date,
  limit: number,
): Promise<number[]> {
  const found = await rows<{ id: number }>(
    req,
    sql`SELECT "id" FROM "messages" WHERE "status" = 'queued' AND "send_at" <= ${now.toISOString()}
      ORDER BY "send_at" ASC, "id" ASC LIMIT ${limit}`,
  )
  return found.map((row) => Number(row.id))
}

/** Messages claimed before `before` that never answered: the runner that held them has ended. */
export async function staleSending(
  req: PayloadRequest,
  before: Date,
): Promise<{ id: number; channel: 'email' | 'whatsapp'; claimedAt: string | null }[]> {
  const found = await rows<{ id: number; channel: 'email' | 'whatsapp'; claimed_at: unknown }>(
    req,
    sql`SELECT "id", "channel", "claimed_at" FROM "messages"
      WHERE "status" = 'sending' AND ("claimed_at" IS NULL OR "claimed_at" < ${before.toISOString()})`,
  )
  return found.map((row) => ({
    id: Number(row.id),
    channel: row.channel,
    claimedAt: row.claimed_at ? new Date(String(row.claimed_at)).toISOString() : null,
  }))
}

/** Cancels the queued messages about a subject (of some automations); returns how many. */
export async function cancelQueuedRows(
  req: PayloadRequest,
  subject: Subject,
  automations: readonly AutomationId[] | undefined,
  now: Date,
): Promise<number> {
  if (automations && automations.length === 0) return 0
  const statuses = sql.join(
    CANCELLABLE_STATUSES.map((status) => sql`${status}`),
    sql`, `,
  )
  const only = automations
    ? sql` AND "automation" IN (${sql.join(
        automations.map((id) => sql`${id}`),
        sql`, `,
      )})`
    : sql``
  const cancelled = await rows<{ id: number }>(
    req,
    sql`UPDATE "messages" SET "status" = 'cancelled', "updated_at" = ${now.toISOString()}
      WHERE "subject_collection" = ${subject.collection} AND "subject_id" = ${subject.id}
      AND "status" IN (${statuses})${only} RETURNING "id"`,
  )
  return cancelled.length
}
