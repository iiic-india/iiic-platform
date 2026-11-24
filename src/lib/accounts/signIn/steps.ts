import 'server-only'

import type { PayloadRequest } from 'payload'

import { clientAddress } from '@/lib/analytics/session'
import { recordAudit } from '@/lib/audit/record'
import { isTokenShaped } from '@/lib/enquiryForms/turnstile'
import { env } from '@/lib/env'
import { currentNotice } from '@/lib/privacy/consents'
import { err, ok, type Result } from '@/lib/result'
import { readFlags } from '@/lib/settings/source'
import { DEFAULT_LANGUAGE } from '@/lib/site/languages'

import { accountActor, accountVerifying, attachEarlierRecords } from '../attach'
import {
  codeRequestInput,
  createAccountInput,
  SIGN_IN,
  SIGN_IN_COOKIE,
  verifyCodeInput,
  type CodeRequestError,
  type CodeRequestOutcome,
  type CreateAccount,
  type RequestCode,
  type SignInChannel,
  type VerifyCode,
} from '../contract'
import { createAccountRecords, newestRecord, under18Holds } from '../lifecycle'
import { clearAttempt, readAttempt, safeNext, writeAttempt, type Attempt } from './cookie'
import { nextSignInDeps, secretOf, secureCookies, type SignInDeps, type SignInEnv } from './deps'
import { deploymentGate } from './gate'
import { normaliseIdentifier } from './identifier'
import { authErrorCode, checkCode, issueCode, triesLeft, whatsappCodesOpen } from './issue'

/**
 * The sign-in steps (docs/20 §4.1 to §4.5): asking for a code, entering it, and for an address
 * with no account the account step. Each answers `closed-here` before it reads its input on a
 * preview, without the secret, or while `accountsEnabled` is off (docs/20 §4.9). Built on their
 * dependencies (`SignInWiring`) so the integration tests drive the same code with their own
 * cookie jar and senders; the exported functions are the contract's, for the server actions.
 */

export type SignInWiring = {
  settings: () => SignInEnv
  deps: (req: PayloadRequest) => Promise<SignInDeps | null>
}

const NEXT_WIRING: SignInWiring = { settings: env, deps: nextSignInDeps }

/** The dependencies when sign-in may act here and now; null when it is closed. */
export async function openFor(
  req: PayloadRequest,
  wiring: SignInWiring,
): Promise<SignInDeps | null> {
  if (deploymentGate(wiring.settings()) !== 'open') return null
  if (!(await readFlags(req.payload)).accountsEnabled) return null
  return wiring.deps(req)
}

// ---- Step 1 · the address ----

export type RequestCodeOptions = { next?: string }

export const requestCodeWith =
  (wiring: SignInWiring) =>
  async (
    req: PayloadRequest,
    input: Parameters<RequestCode>[1],
    now: Date,
    options: RequestCodeOptions = {},
  ): Promise<Result<CodeRequestOutcome, CodeRequestError>> => {
    const deps = await openFor(req, wiring)
    if (!deps) return err({ code: 'closed-here' })
    const parsed = codeRequestInput.safeParse(input)
    if (!parsed.success) return err({ code: 'invalid-identifier' })
    const { channel, identifier, turnstileToken } = parsed.data
    const value = normaliseIdentifier(channel, identifier)
    if (!value) return err({ code: 'invalid-identifier' })
    if (channel === 'whatsapp' && !(await whatsappCodesOpen(req, deps.env, now))) {
      return err({ code: 'whatsapp-closed', emailInstead: true })
    }
    // Before anything is stored (docs/20 §4.8).
    if (deps.turnstile) {
      const passed =
        isTokenShaped(turnstileToken) &&
        (await deps.turnstile(turnstileToken, clientAddress(deps.headers) || null))
      if (!passed) return err({ code: 'check-failed' })
    }
    const next = safeNext(options.next)
    return issueCode(
      req,
      deps,
      { purpose: 'signIn', channel, value, ...(next ? { next } : {}) },
      now,
    )
  }

export const requestCode = requestCodeWith(NEXT_WIRING) satisfies RequestCode

/**
 * "Send a new code" (docs/20 §4.1, step 2): the same address, from the sign-in cookie, which only
 * step 1 sets (Turnstile was answered there). Too early, and the person reads when they can ask.
 */
export const resendCodeWith =
  (wiring: SignInWiring) =>
  async (
    req: PayloadRequest,
    now: Date,
  ): Promise<Result<CodeRequestOutcome, CodeRequestError | { code: 'no-request' }>> => {
    const deps = await openFor(req, wiring)
    if (!deps) return err({ code: 'closed-here' })
    const attempt = await readAttempt(deps.jar, secretOf(deps), now)
    if (!attempt || attempt.provenAt) return err({ code: 'no-request' })
    if (attempt.channel === 'whatsapp' && !(await whatsappCodesOpen(req, deps.env, now))) {
      return err({ code: 'whatsapp-closed', emailInstead: true })
    }
    return issueCode(
      req,
      deps,
      {
        purpose: attempt.purpose,
        channel: attempt.channel,
        value: attempt.address,
        ...(attempt.accountId ? { accountId: attempt.accountId } : {}),
        ...(attempt.next ? { next: attempt.next } : {}),
      },
      now,
    )
  }

export const resendCode = resendCodeWith(NEXT_WIRING)

/** The sign-in in progress in this browser, for the pages that draw its steps. */
export const currentAttemptWith =
  (wiring: SignInWiring) =>
  async (req: PayloadRequest, now: Date): Promise<Attempt | null> => {
    const deps = await openFor(req, wiring)
    return deps ? readAttempt(deps.jar, secretOf(deps), now) : null
  }

export const currentAttempt = currentAttemptWith(NEXT_WIRING)

/** "Use a different address" and the account step's "No, thanks": nothing is kept. */
export const startAgainWith = (wiring: SignInWiring) => async (req: PayloadRequest) => {
  const deps = await openFor(req, wiring)
  if (deps) clearAttempt(deps.jar, secureCookies(deps))
}

export const startAgain = startAgainWith(NEXT_WIRING)

// ---- Signing in to an account that exists ----

/**
 * A session for the account (docs/20 §4.5, step 3): Better Auth's user is made first if the
 * account step stopped before it, or if closing removed it part-way; then the session, kept or
 * not as ticked, the last sign-in, `sign-in` in the audit log and the earlier records attached.
 */
async function signInToAccount(
  req: PayloadRequest,
  deps: SignInDeps,
  input: { accountId: number; channel: SignInChannel; value: string; trusted: boolean },
  now: Date,
): Promise<number> {
  const { auth } = deps
  const account = await req.payload.findByID({
    collection: 'accounts',
    id: input.accountId,
    depth: 0,
    select: { authUserId: true },
    // scope: the account whose own record holds the detail this request's code has just proven
    overrideAccess: true,
    req,
  })
  const makeUser = async () => {
    const made = await auth.api.createCustomer({
      body: { channel: input.channel, value: input.value },
    })
    await req.payload.update({
      collection: 'accounts',
      id: input.accountId,
      data: { authUserId: made.userId },
      // scope: the same account, given its Better Auth user
      overrideAccess: true,
      depth: 0,
      req,
    })
    return made.userId
  }
  const userId = account.authUserId || (await makeUser())
  const start = (id: string) =>
    auth.api.startSession({ body: { userId: id, trusted: input.trusted }, headers: deps.headers })
  try {
    await start(userId)
  } catch (error) {
    if (authErrorCode(error) !== 'USER_NOT_FOUND') throw error
    await start(await makeUser())
  }
  await req.payload.update({
    collection: 'accounts',
    id: input.accountId,
    data: {
      lastSignInAt: now.toISOString(),
      lastSignInAt_tz: 'Asia/Kolkata',
      lastSignInChannel: input.channel,
    },
    // scope: the same account, its last sign-in
    overrideAccess: true,
    depth: 0,
    req,
  })
  await recordAudit(
    req,
    { action: 'sign-in', entity: 'accounts', entityId: input.accountId, changed: [input.channel] },
    accountActor(input.accountId),
  )
  const { attached } = await attachEarlierRecords(req, {
    accountId: input.accountId,
    channel: input.channel,
    value: input.value,
  })
  return attached.length
}

// ---- Step 2 · the code ----

export const verifyCodeWith =
  (wiring: SignInWiring): VerifyCode =>
  async (req, input, now) => {
    const deps = await openFor(req, wiring)
    if (!deps) return err({ code: 'closed-here' })
    const attempt = await readAttempt(deps.jar, secretOf(deps), now)
    if (!attempt || attempt.purpose !== 'signIn') return err({ code: 'no-request' })
    const target = { purpose: 'signIn' as const, channel: attempt.channel, value: attempt.address }
    // Proven already (the page was sent twice): the account step is next.
    if (attempt.provenAt) {
      const newest = await newestRecord(req, attempt.channel, attempt.address)
      return ok({ state: 'needs-account', suggestedName: newest?.fullName ?? null })
    }
    const parsed = verifyCodeInput.safeParse(input)
    // Not six digits: nothing to check, and no try counted.
    if (!parsed.success) return triesLeft(deps, target)
    const checked = await checkCode(deps, target, parsed.data.code)
    if (!checked.ok) return checked

    const accountId = await accountVerifying(req, attempt.channel, attempt.address)
    if (accountId !== null) {
      const attached = await signInToAccount(
        req,
        deps,
        {
          accountId,
          channel: attempt.channel,
          value: attempt.address,
          trusted: parsed.data.trustDevice,
        },
        now,
      )
      clearAttempt(deps.jar, secureCookies(deps))
      return ok({ state: 'signed-in', accountId, attached })
    }
    // No account: the address is proven for fifteen minutes, for the account step.
    await writeAttempt(
      deps.jar,
      secretOf(deps),
      { ...attempt, provenAt: now.getTime(), trustDevice: parsed.data.trustDevice },
      now,
      secureCookies(deps),
    )
    const newest = await newestRecord(req, attempt.channel, attempt.address)
    return ok({ state: 'needs-account', suggestedName: newest?.fullName ?? null })
  }

export const verifyCode = verifyCodeWith(NEXT_WIRING)

// ---- Step 3 · the account (a new address only) ----

/** The fields the account step's input names when it is not what the step asks. */
function fieldsOf(issues: readonly { path: readonly PropertyKey[] }[]): string[] {
  return [...new Set(issues.map((issue) => String(issue.path[0] ?? 'form')))]
}

/**
 * The consent first, in one transaction with the person and the account; then Better Auth's user,
 * the session and the attachments (docs/20 §4.5). A failure after the transaction leaves an
 * account with no user, which the next right code for the address finishes.
 */
export const createAccountWith =
  (wiring: SignInWiring): CreateAccount =>
  async (req, input, now) => {
    const deps = await openFor(req, wiring)
    if (!deps) return err({ code: 'closed-here' })
    const attempt = await readAttempt(deps.jar, secretOf(deps), now)
    if (!attempt || attempt.purpose !== 'signIn' || !attempt.provenAt) {
      return err({ code: 'no-request' })
    }
    if (now.getTime() - attempt.provenAt > SIGN_IN_COOKIE.maxAgeSeconds * 1000) {
      return err({ code: 'expired' })
    }
    const parsed = createAccountInput.safeParse(input)
    if (!parsed.success)
      return err({ code: 'invalid-input', fields: fieldsOf(parsed.error.issues) })
    const notice = await currentNotice(req.payload, 'account', DEFAULT_LANGUAGE, now)
    if (!notice) return err({ code: 'notice-missing' })
    if (notice.id !== parsed.data.noticeVersionId) return err({ code: 'notice-changed' })
    if (await under18Holds(req, attempt.channel, attempt.address)) {
      return err({ code: 'not-for-under-18' })
    }
    const target = { channel: attempt.channel, value: attempt.address }
    // Another tab finished the account step already: sign in to it, with no second consent.
    const existing = await accountVerifying(req, target.channel, target.value)
    const accountId =
      existing ??
      (
        await createAccountRecords(req, {
          ...target,
          fullName: parsed.data.fullName,
          noticeVersionId: notice.id,
          evidence: {
            ip: clientAddress(deps.headers) || null,
            userAgent: deps.headers.get('user-agent'),
          },
          now,
        })
      ).accountId
    const attached = await signInToAccount(
      req,
      deps,
      { accountId, ...target, trusted: parsed.data.trustDevice },
      now,
    )
    clearAttempt(deps.jar, secureCookies(deps))
    return ok({ accountId, attached })
  }

export const createAccount = createAccountWith(NEXT_WIRING)

/** The code step's hint before the person types: the time a new code may be asked for. */
export function resendOpensAt(attempt: Attempt): Date {
  return new Date(attempt.sentAt + SIGN_IN.resendAfterSeconds * 1000)
}
