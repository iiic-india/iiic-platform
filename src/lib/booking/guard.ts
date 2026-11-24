import 'server-only'

import { randomBytes } from 'node:crypto'

import { sql } from '@payloadcms/db-postgres'
import {
  commitTransaction,
  initTransaction,
  killTransaction,
  ValidationError,
  type PayloadRequest,
} from 'payload'

import { err, ok, type Result } from '@/lib/result'

/**
 * The booking module's way into the database (docs/16 §4): transactions it owns or joins, row and
 * practitioner locks, and the double-booking guard's answer turned into a typed error.
 *
 * Postgres refuses an overlapping active booking with SQLSTATE 23P01 (the exclusion constraint
 * `bookings_no_overlap`). A refused statement aborts its transaction, and Payload's own create and
 * update roll the whole request's transaction back when they fail. So every write the guard may
 * refuse runs inside a savepoint: a refusal undoes that write only, the caller's transaction stays
 * usable, and the answer is `{ code: 'slot-taken' }`. The payments module can then refund in the
 * same transaction that recorded the gateway's event (B10).
 */

/** The SQLSTATE of a database error, looked for through the causes the drivers wrap it in. */
export function sqlStateOf(error: unknown): string | undefined {
  let current: unknown = error
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth += 1) {
    const code = (current as { code?: unknown }).code
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code
    current = (current as { cause?: unknown }).cause
  }
  return undefined
}

/** The exclusion constraint's refusal: the time overlaps another active booking. */
export function isSlotTaken(error: unknown): boolean {
  return sqlStateOf(error) === '23P01'
}

/** Payload's answer to a unique index (it turns 23505 into a ValidationError naming the field). */
export function isUniqueOn(error: unknown, field: string): boolean {
  if (sqlStateOf(error) === '23505') return true
  return (
    error instanceof ValidationError &&
    error.data.errors.some((entry) => entry.path === field || entry.path?.endsWith(`.${field}`))
  )
}

/**
 * Runs work in the request's transaction, starting one when the request has none. A transaction
 * it started is committed when `keep` says the outcome should stand (by default, always) and
 * rolled back otherwise or on a throw; a transaction it joined is the caller's to end.
 */
export async function inTransaction<T>(
  req: PayloadRequest,
  work: () => Promise<T>,
  keep: (value: T) => boolean = () => true,
): Promise<T> {
  const owned = await initTransaction(req)
  try {
    const value = await work()
    if (owned) {
      if (keep(value)) await commitTransaction(req)
      else await killTransaction(req)
    }
    return value
  } catch (error) {
    if (owned) await killTransaction(req)
    throw error
  }
}

/** Keeps a transaction whose work answered with a success, rolls back one that answered no. */
export const keepOk = (result: { ok: boolean }) => result.ok

type Session = {
  db: { execute: (query: ReturnType<typeof sql.raw>) => Promise<{ rows: unknown[] }> }
  resolve: () => Promise<void>
  reject: () => Promise<void>
}
type SessionsAdapter = { sessions?: Record<string, Session> }

async function sessionOf(req: PayloadRequest): Promise<{ id: string; session: Session }> {
  const id = await req.transactionID
  const sessions = (req.payload.db as unknown as SessionsAdapter).sessions
  const session = id === undefined || id === null ? undefined : sessions?.[String(id)]
  if (!session) throw new Error('The booking module writes only inside a transaction.')
  return { id: String(id), session }
}

/** Runs a statement on the request's transaction. */
export async function execute(req: PayloadRequest, query: ReturnType<typeof sql>) {
  const { session } = await sessionOf(req)
  return session.db.execute(query as ReturnType<typeof sql.raw>)
}

/**
 * Takes the booking's row lock for the rest of the transaction, so that reading its state and
 * moving it happen as one step: the hold sweep and a late payment never both act on one booking.
 */
export async function lockBooking(req: PayloadRequest, bookingId: number): Promise<boolean> {
  const { rows } = await execute(
    req,
    sql`SELECT "id" FROM "bookings" WHERE "id" = ${bookingId} FOR UPDATE`,
  )
  return rows.length === 1
}

/** One namespace for the practitioner locks, so they meet no other advisory lock. */
const PRACTITIONER_LOCK = 3_160_016

/**
 * Takes a practitioner's booking lock for the rest of the transaction: two people placing a time
 * with one practitioner are served one after the other, so each sees the other's booking when it
 * checks the buffer around its own. The exclusion constraint still decides an overlap.
 */
export async function lockPractitioner(req: PayloadRequest, practitionerId: number) {
  await execute(req, sql`SELECT pg_advisory_xact_lock(${PRACTITIONER_LOCK}, ${practitionerId})`)
}

/**
 * Runs a write the double-booking guard may refuse, inside a savepoint of the request's
 * transaction. Payload's operations roll the request's transaction back when they fail, by its
 * id: for the duration of the write the request carries an alias of its transaction whose rollback
 * undoes nothing, so a failure rolls back to the savepoint only. A refusal by the exclusion
 * constraint becomes `slot-taken`; any other failure is undone the same way and thrown again.
 */
export async function guarded<T>(
  req: PayloadRequest,
  write: () => Promise<T>,
): Promise<Result<T, { code: 'slot-taken' }>> {
  const { id, session } = await sessionOf(req)
  const sessions = (req.payload.db as unknown as SessionsAdapter).sessions as Record<
    string,
    Session
  >
  const savepoint = `booking_guard_${randomBytes(6).toString('hex')}`
  const alias = `${id}:${savepoint}`
  sessions[alias] = { db: session.db, resolve: async () => {}, reject: async () => {} }
  await session.db.execute(sql.raw(`SAVEPOINT ${savepoint}`))
  req.transactionID = alias
  try {
    const value = await write()
    await session.db.execute(sql.raw(`RELEASE SAVEPOINT ${savepoint}`))
    return ok(value)
  } catch (error) {
    await session.db.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${savepoint}`))
    if (isSlotTaken(error)) return err({ code: 'slot-taken' })
    throw error
  } finally {
    delete sessions[alias]
    req.transactionID = id
  }
}
