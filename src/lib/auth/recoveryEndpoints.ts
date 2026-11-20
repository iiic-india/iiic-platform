import { sql } from '@payloadcms/db-postgres'
import {
  commitTransaction,
  incrementLoginAttempts,
  initTransaction,
  killTransaction,
  resetLoginAttempts,
  type CollectionSlug,
  type PayloadHandler,
  type PayloadRequest,
} from 'payload'
import { z } from 'zod'

import { isActive } from '@/access/roles'
import { TWO_FACTOR_COPY } from '@/plugins/totpCopy'

import { newAuthenticator } from './newAuthenticator'
import {
  hashRecoveryCode,
  matchesRecoveryCode,
  newRecoveryCode,
  RECOVERY_CODE_COUNT,
} from './recoveryCodes'
import { isRecoveryCodeShape } from './recoveryCodeShape'

const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const strategyOf = (req: PayloadRequest) => (req.user as { _strategy?: string } | null)?._strategy

const NOT_SIGNED_IN = 'Sign in with your email and password first.'
const NOT_A_CODE =
  'That code is not one of your unused recovery codes. Check it against your saved list.'

/** The request body: one code, of a sane length; its shape is checked after normalising. */
const RecoveryRequest = z.object({ code: z.string().max(64) })

/** The staff row as the database holds it, for the lock and the sessions. */
type StaffRow = {
  id: number | string
  lockUntil?: string | null
  sessions?: { id: string }[] | null
}

function lockedMessage(remainingMs: number): string {
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000))
  return `This account is locked after too many wrong attempts. Try again in ${minutes} ${
    minutes === 1 ? 'minute' : 'minutes'
  }, or ask an owner to lift the lock.`
}

async function inTransaction<T>(req: PayloadRequest, work: () => Promise<T>): Promise<T> {
  const owned = await initTransaction(req)
  try {
    const result = await work()
    if (owned) await commitTransaction(req)
    return result
  } catch (error) {
    if (owned) await killTransaction(req)
    throw error
  }
}

/** The id of the person's unused code that matches, trying each of their (at most ten). */
async function findUnusedCode(
  req: PayloadRequest,
  userId: number | string,
  code: string,
): Promise<number | string | undefined> {
  const { docs } = await req.payload.find({
    collection: 'staff-recovery-codes',
    where: { and: [{ user: { equals: userId } }, { usedAt: { exists: false } }] },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  for (const doc of docs) {
    if (await matchesRecoveryCode(code, doc.codeHash)) return doc.id
  }
  return undefined
}

class CodeAlreadyUsed extends Error {}

/** Logs only the error's name: a failed query's message carries its values, the person's details among them. */
function failed(req: PayloadRequest, what: string, error: unknown) {
  req.payload.logger.error(
    `${what} failed (${error instanceof Error ? error.name : 'unknown error'}).`,
  )
  return json({ message: TWO_FACTOR_COPY.failed }, 500)
}

/**
 * payload-totp counts wrong codes in a `totp-attempts` row of its own, keyed by the user's id,
 * which Payload's unlock clears only for someone else's account. Codes typed before a recovery
 * belonged to the lost authenticator, so the count starts again for the new one.
 */
async function clearCodeAttempts(req: PayloadRequest, userId: number | string) {
  const collection = 'totp-attempts' as CollectionSlug
  const id = String(userId)
  if (await req.payload.db.findOne({ collection, where: { id: { equals: id } } })) {
    await req.payload.db.updateOne({
      collection,
      id,
      data: { attempts: 0, lockUntil: null },
      returning: false,
    })
  }
}

/**
 * Marks a code used only while it is still unused, inside the request's transaction. Postgres
 * checks the condition again on the row it updates, so of two requests with the same code
 * exactly one claims it; Payload's own update reads first and writes by id, which both would
 * pass.
 */
async function claimCode(req: PayloadRequest, id: number | string): Promise<boolean> {
  const adapter = req.payload.db
  const transactionID = await req.transactionID
  // The transaction's own connection, found as @payloadcms/drizzle's getTransaction does.
  const db = ((transactionID !== undefined && transactionID !== null
    ? adapter.sessions?.[transactionID]?.db
    : undefined) ?? adapter.drizzle) as unknown as {
    execute: (query: ReturnType<typeof sql>) => Promise<{ rows: unknown[] }>
  }
  const result = await db.execute(
    sql`UPDATE "staff_recovery_codes" SET "used_at" = now(), "updated_at" = now() WHERE "id" = ${id} AND "used_at" IS NULL RETURNING "id"`,
  )
  return result.rows.length === 1
}

/**
 * POST /api/users/recovery-codes: a new set of ten codes for the signed-in staff member, who
 * must have entered their two-factor code. The old set stops working. The codes are returned
 * once and stored only as hashes.
 */
export const createRecoveryCodes: PayloadHandler = async (req) => {
  const user = req.user
  if (!user || user.collection !== 'users' || strategyOf(req) !== 'totp' || !isActive(user)) {
    return json({ message: 'Sign in with your code to create recovery codes.' }, 401)
  }
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode)
  try {
    const hashes = await Promise.all(codes.map(hashRecoveryCode))
    await inTransaction(req, async () => {
      await req.payload.delete({
        collection: 'staff-recovery-codes',
        where: { user: { equals: user.id } },
        overrideAccess: true,
        req,
      })
      for (const codeHash of hashes) {
        await req.payload.create({
          collection: 'staff-recovery-codes',
          data: { user: user.id, codeHash },
          overrideAccess: true,
          req,
        })
      }
    })
  } catch (error) {
    return failed(req, 'Creating recovery codes', error)
  }
  return json({ codes })
}

/**
 * POST /api/users/recover-two-factor with `{ code }`: someone who has signed in with their
 * password, but has lost their authenticator, uses one recovery code. The same step stores a
 * new secret and returns it once, for the verify page to show as a QR code: the account never
 * goes without an authenticator, which whoever signed in next with the password could set up.
 * Their other sessions end, and a code from the new authenticator finishes the sign-in
 * (payload-totp's /api/verify-totp). A wrong code counts towards the lockout, as a wrong
 * password does.
 */
export const recoverTwoFactor: PayloadHandler = async (req) => {
  const user = req.user
  if (!user || user.collection !== 'users' || !isActive(user)) {
    return json({ message: NOT_SIGNED_IN }, 401)
  }
  try {
    const users = req.payload.collections.users.config
    const row = await req.payload.db.findOne<StaffRow>({
      collection: 'users',
      where: { id: { equals: user.id } },
      req,
    })
    if (!row) return json({ message: NOT_SIGNED_IN }, 401)
    const lockedFor = (row.lockUntil ? new Date(row.lockUntil).getTime() : 0) - Date.now()
    if (lockedFor > 0) return json({ message: lockedMessage(lockedFor) }, 423)

    const body = RecoveryRequest.safeParse(await req.json?.().catch(() => null))
    const code = body.success ? body.data.code : ''
    const match = isRecoveryCodeShape(code) ? await findUnusedCode(req, user.id, code) : undefined
    if (match === undefined) {
      await incrementLoginAttempts({ collection: users, payload: req.payload, user: row as never })
      return json({ message: NOT_A_CODE }, 400)
    }

    const fresh = await newAuthenticator(user.email)
    const currentSession = (user as { _sid?: string })._sid
    await inTransaction(req, async () => {
      if (!(await claimCode(req, match))) throw new CodeAlreadyUsed()
      await req.payload.update({
        collection: 'users',
        id: user.id,
        data: {
          totpSecret: fresh.secret,
          sessions: (row.sessions ?? []).filter((session) => session.id === currentSession),
        },
        overrideAccess: true,
        req,
      })
      await resetLoginAttempts({ collection: users, doc: row, payload: req.payload, req })
    })
    await clearCodeAttempts(req, user.id)
    // Returned only here, with no-store, so only this person can scan it.
    return json({ ok: true, secret: fresh.secret, qr: fresh.qr })
  } catch (error) {
    // The same code, used a moment earlier by a parallel request.
    if (error instanceof CodeAlreadyUsed) return json({ message: NOT_A_CODE }, 400)
    return failed(req, 'Using a recovery code', error)
  }
}
