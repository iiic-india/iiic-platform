import {
  commitTransaction,
  incrementLoginAttempts,
  initTransaction,
  killTransaction,
  resetLoginAttempts,
  type PayloadHandler,
  type PayloadRequest,
} from 'payload'

import { isActive } from '@/access/roles'

import {
  hashRecoveryCode,
  newRecoveryCode,
  normaliseRecoveryCode,
  RECOVERY_CODE_COUNT,
} from './recoveryCodes'

const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const strategyOf = (req: PayloadRequest) => (req.user as { _strategy?: string } | null)?._strategy

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
  await inTransaction(req, async () => {
    await req.payload.delete({
      collection: 'staff-recovery-codes',
      where: { user: { equals: user.id } },
      overrideAccess: true,
      req,
    })
    for (const code of codes) {
      await req.payload.create({
        collection: 'staff-recovery-codes',
        data: { user: user.id, codeHash: hashRecoveryCode(code) },
        overrideAccess: true,
        req,
      })
    }
  })
  return json({ codes })
}

/**
 * POST /api/users/recover-two-factor with `{ code }`: someone who has signed in with their
 * password, but has lost their authenticator, uses one recovery code. Their authenticator is
 * removed and they set up a new one straight away (the plugin's forced setup). A wrong code
 * counts towards the account lockout, as a wrong password does.
 */
export const recoverTwoFactor: PayloadHandler = async (req) => {
  const user = req.user
  if (!user || user.collection !== 'users' || !isActive(user)) {
    return json({ message: 'Sign in with your email and password first.' }, 401)
  }
  const users = req.payload.collections.users.config
  const row = await req.payload.db.findOne<Record<string, unknown> & { id: number | string }>({
    collection: 'users',
    where: { id: { equals: user.id } },
    req,
  })
  if (!row) return json({ message: 'Sign in with your email and password first.' }, 401)
  const lockedUntil = typeof row.lockUntil === 'string' ? new Date(row.lockUntil).getTime() : 0
  if (lockedUntil > Date.now()) {
    return json(
      { message: 'Too many wrong codes. Wait 15 minutes, or ask an owner to unlock your account.' },
      423,
    )
  }

  const body = (await req.json?.().catch(() => null)) as { code?: unknown } | null
  const code = typeof body?.code === 'string' ? body.code : ''
  const { docs } =
    normaliseRecoveryCode(code).length === 12
      ? await req.payload.find({
          collection: 'staff-recovery-codes',
          where: {
            and: [
              { user: { equals: user.id } },
              { codeHash: { equals: hashRecoveryCode(code) } },
              { usedAt: { exists: false } },
            ],
          },
          limit: 1,
          overrideAccess: true,
          req,
        })
      : { docs: [] }
  const match = docs[0]
  if (!match) {
    await incrementLoginAttempts({ collection: users, payload: req.payload, user: row as never })
    return json({ message: 'That code is not one of your unused recovery codes.' }, 400)
  }

  await inTransaction(req, async () => {
    await req.payload.update({
      collection: 'staff-recovery-codes',
      id: match.id,
      data: { usedAt: new Date().toISOString() },
      overrideAccess: true,
      req,
    })
    await req.payload.update({
      collection: 'users',
      id: user.id,
      data: { totpSecret: null },
      overrideAccess: true,
      req,
    })
    await resetLoginAttempts({ collection: users, doc: row, payload: req.payload, req })
  })
  return json({ ok: true })
}
