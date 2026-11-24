import 'server-only'

import { Secret, TOTP } from 'otpauth'
import { incrementLoginAttempts, type PayloadRequest } from 'payload'
import { z } from 'zod'

import { TOTP_OPTIONS } from '@/lib/auth/totp'
import { err, ok, type Result } from '@/lib/result'

/**
 * Re-entering the two-factor code before an erasure or an export (docs/05: re-authentication for
 * exports and erasure; docs/08 §9; docs/18 §5): the code is typed into the confirming form and
 * checked here against the account's own authenticator, so the act runs within moments of it,
 * well inside the five minutes the design allows. A wrong code counts towards the account's
 * lockout, as a wrong password does; a locked account is refused before any code is checked.
 */

/** Where a request that passed the check keeps the time it did (read by codeEnteredRecently). */
const STEP_UP = 'privacyCodeEnteredAt'

/** How long a code entered counts for an act on the same request. */
export const STEP_UP_WITHIN_MS = 5 * 60 * 1000

export type StepUpError = { code: 'wrong-code' } | { code: 'locked' }

const codeShape = z
  .string()
  .transform((value) => value.replace(/\s/g, ''))
  .pipe(z.string().regex(/^\d{6}$/))

type StaffRow = { id: number | string; lockUntil?: string | null }

/** Checks the code typed; on success, this request may make one decision act. */
export async function enterCodeAgain(
  req: PayloadRequest,
  code: unknown,
): Promise<Result<true, StepUpError>> {
  const user = req.user
  if (!user || user.collection !== 'users') return err({ code: 'wrong-code' })
  const row = await req.payload.db.findOne<StaffRow>({
    collection: 'users',
    where: { id: { equals: user.id } },
    req,
  })
  if (!row) return err({ code: 'wrong-code' })
  if (row.lockUntil && new Date(row.lockUntil).getTime() > Date.now()) {
    return err({ code: 'locked' })
  }

  const typed = codeShape.safeParse(code)
  // The secret is hidden from every read but one that asks; totpSecretAtRest opens it.
  const stored = await req.payload.findByID({
    collection: 'users',
    id: user.id,
    depth: 0,
    showHiddenFields: true,
    overrideAccess: true,
    req,
  })
  const secret = (stored as { totpSecret?: unknown } | null)?.totpSecret
  const { algorithm, digits, period } = TOTP_OPTIONS.totp ?? {}
  const valid =
    typed.success &&
    typeof secret === 'string' &&
    secret !== '' &&
    new TOTP({ algorithm, digits, period, secret: Secret.fromBase32(secret) }).validate({
      token: typed.data,
      window: 1,
    }) !== null
  if (!valid) {
    await incrementLoginAttempts({
      collection: req.payload.collections.users.config,
      payload: req.payload,
      user: row as never,
    })
    return err({ code: 'wrong-code' })
  }
  req.context[STEP_UP] = Date.now()
  return ok(true)
}

/** Whether this request entered the code again within the last five minutes. */
export function codeEnteredRecently(req: PayloadRequest, now = Date.now()): boolean {
  const at = req.context?.[STEP_UP]
  return typeof at === 'number' && now - at >= 0 && now - at < STEP_UP_WITHIN_MS
}
