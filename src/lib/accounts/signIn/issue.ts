import 'server-only'

import type { PayloadRequest } from 'payload'

import { clientAddress } from '@/lib/analytics/session'
import { submitterHash, submitterHashesWithin } from '@/lib/enquiryForms/guards'
import { channelsFor } from '@/lib/messaging/channelsFor'
import type { PlannedMessage } from '@/lib/messaging/operations'
import { err, ok, type Result } from '@/lib/result'
import { inQuietHours } from '@/lib/settings/quietHours'
import { readQuietHours } from '@/lib/settings/source'

import { EMAIL_CODE_TYPE, type CodePurpose } from '../auth/codes'
import { whatsappCourier } from '../auth/options'
import {
  SIGN_IN,
  type CodeRequestError,
  type CodeRequestOutcome,
  type SignInChannel,
  type VerifyCodeError,
} from '../contract'
import { writeAttempt, type Attempt } from './cookie'
import { secretOf, secureCookies, type SignInDeps, type SignInEnv } from './deps'
import { identifierHash, maskIdentifier } from './identifier'
import { limitVerdict, LOOK_BACK, MOST_ROWS, type RequestTimes } from './limits'

/**
 * Making, sending and checking a code (docs/20 §4.2 to §4.4, §4.8), for a sign-in and for a
 * second detail alike. The same path runs whether or not the address has an account, earlier
 * records or a suppression: the row is written, the code made and the message planned in every
 * case, and the person sees the same answer. Nothing here logs an address or a code; the code
 * goes from Better Auth to the message's first try (`transient`) and nowhere else.
 */

/** What `sign-in-requests` stores for a request whose network address the server cannot see. */
export const NO_NETWORK = 'none'

// scope: none of its own; each spread of SERVER below carries its own scope line (D-132)
const SERVER = { overrideAccess: true, depth: 0 } as const

/** When the codes for an address, from a network address and from anyone went lately. */
export async function readRequestTimes(
  req: PayloadRequest,
  input: { identifierHash: string; networkHashes: readonly string[] | null },
  now: Date,
): Promise<RequestTimes> {
  const since = (windowMs: number) => new Date(now.getTime() - windowMs).toISOString()
  const times = async (
    field: 'identifierHash' | 'networkHash',
    values: readonly string[],
    windowMs: number,
    limit: number,
  ) => {
    const { docs } = await req.payload.find({
      collection: 'sign-in-requests',
      where: {
        and: [{ [field]: { in: [...values] } }, { requestedAt: { greater_than: since(windowMs) } }],
      },
      sort: '-requestedAt',
      limit,
      select: { requestedAt: true },
      req,
      // scope: sign-in requests by the keyed hash of what was typed or of the network address; they hold no one's details, and only their times are read
      ...SERVER,
    })
    return docs.map((doc) => new Date(doc.requestedAt))
  }
  const { totalDocs: site } = await req.payload.count({
    collection: 'sign-in-requests',
    where: { requestedAt: { greater_than: since(LOOK_BACK.site) } },
    // scope: a count of sign-in requests across the site; it reads no row
    overrideAccess: true,
    req,
  })
  return {
    identifier: await times(
      'identifierHash',
      [input.identifierHash],
      LOOK_BACK.identifier,
      MOST_ROWS.identifier,
    ),
    network: input.networkHashes
      ? await times('networkHash', input.networkHashes, LOOK_BACK.network, MOST_ROWS.network)
      : null,
    site,
  }
}

/**
 * Whether a WhatsApp code may go now (docs/20 §4.3): the channel is set up here, Meta's
 * authentication template is approved for it, and it is not quiet hours (D-103, D-123). The
 * `accountsEnabled` flag has been read already. Until I-03, I-40 and I-66 the answer is no, and
 * `/login` shows email only (D-126).
 */
export async function whatsappCodesOpen(
  req: PayloadRequest,
  settings: SignInEnv,
  now: Date,
): Promise<boolean> {
  if (!channelsFor(settings).configured.whatsapp) return false
  const { totalDocs } = await req.payload.count({
    collection: 'message-templates',
    where: {
      and: [
        { key: { equals: 'account-sign-in-code' } },
        { channel: { equals: 'whatsapp' } },
        { status: { equals: 'approved' } },
        { providerTemplateName: { exists: true } },
      ],
    },
    // scope: a count of approved message templates; no person's data
    overrideAccess: true,
    req,
  })
  if (totalDocs === 0) return false
  return !inQuietHours(now, await readQuietHours(req.payload))
}

/** What the person typed and where it is going: a sign-in, or a second detail for an account. */
export type CodeTarget = {
  purpose: CodePurpose
  channel: SignInChannel
  /** The address as stored: an email in small letters, a mobile in E.164. */
  value: string
  accountId?: number
  next?: string
}

/**
 * Counts the limits, writes the request's row, makes the code (a new one ends the old), plans A1
 * with the code and the address as its first try's `transient`, and sets the sign-in cookie.
 * A refused request writes nothing and counts for nothing (D-92, D-108).
 */
export async function issueCode(
  req: PayloadRequest,
  deps: SignInDeps,
  target: CodeTarget,
  now: Date,
): Promise<Result<CodeRequestOutcome, CodeRequestError>> {
  const secret = secretOf(deps)
  const hash = identifierHash(secret, target.channel, target.value)
  const address = clientAddress(deps.headers)
  const verdict = limitVerdict(
    await readRequestTimes(
      req,
      {
        identifierHash: hash,
        networkHashes: address
          ? submitterHashesWithin(secret, address, now, LOOK_BACK.network)
          : null,
      },
      now,
    ),
    now,
  )
  if (!verdict.ok) {
    return err(
      verdict.code === 'busy' ? { code: 'busy' } : { code: 'too-many', retryAt: verdict.retryAt },
    )
  }

  const row = await req.payload.create({
    collection: 'sign-in-requests',
    data: {
      purpose: target.purpose,
      channel: target.channel,
      identifierHash: hash,
      networkHash: address ? submitterHash(secret, address, now) : NO_NETWORK,
      requestedAt: now.toISOString(),
    },
    req,
    // scope: this request's own row: keyed hashes and the time, no one's details
    ...SERVER,
  })

  const { auth } = deps
  // A new code replaces the old one: only the latest works (docs/20 §4.2).
  await auth.api.forgetCode({
    body: { purpose: target.purpose, channel: target.channel, value: target.value },
  })
  const planned: PlannedMessage = {
    automation: 'A1',
    template: 'account-sign-in-code',
    channel: target.channel,
    recipient: { kind: 'signIn', id: row.id },
    subject: { collection: 'sign-in-requests', id: row.id },
    sendAt: now,
    sendBefore: new Date(now.getTime() + SIGN_IN.codeTtlSeconds * 1000),
  }
  const send = async (code: string) => {
    const planned_ = await deps.deliver(req, planned, {
      transient: { address: target.value, code },
    })
    // The answer to the person is the same whatever happened (docs/20 §4.4); the log keeps the
    // outcome code only.
    if (!planned_.ok) {
      req.payload.logger.warn({ msg: `sign-in: code not planned (${planned_.error.code})` })
    }
  }
  if (target.channel === 'email') {
    const code = await auth.api.createVerificationOTP({
      body: { email: target.value, type: EMAIL_CODE_TYPE[target.purpose] },
    })
    await send(code)
  } else {
    await whatsappCourier.run(send, () =>
      auth.api.sendPhoneNumberOTP({ body: { phoneNumber: target.value } }),
    )
  }

  const attempt: Attempt = {
    v: 1,
    purpose: target.purpose,
    channel: target.channel,
    address: target.value,
    requestId: row.id,
    sentAt: now.getTime(),
    ...(target.accountId ? { accountId: target.accountId } : {}),
    ...(target.next ? { next: target.next } : {}),
  }
  await writeAttempt(deps.jar, secret, attempt, now, secureCookies(deps))
  return ok({
    masked: maskIdentifier(target.channel, target.value),
    resendAt: new Date(now.getTime() + SIGN_IN.resendAfterSeconds * 1000),
  })
}

/** The code of Better Auth's error, when it is one ("INVALID_OTP", "USER_NOT_FOUND"). */
export function authErrorCode(error: unknown): string | null {
  const body = (error as { body?: { code?: unknown } } | null)?.body
  return typeof body?.code === 'string' ? body.code : null
}

/**
 * Checks a code with Better Auth, which counts the tries and ends the code at the fifth wrong one
 * (docs/20 §4.2). Email: `checkVerificationOTP` puts a right code back for a follow-up call, so the
 * code is spent here at once; for an address with no Better Auth user, 1.7.27 answers
 * `USER_NOT_FOUND` only after the code has passed, which is read as a proven address (a unit test
 * on the installed version holds that order). WhatsApp: `consumePhoneNumberOTP`, which spends it.
 */
export async function checkCode(
  deps: SignInDeps,
  target: Pick<CodeTarget, 'purpose' | 'channel' | 'value'>,
  code: string,
): Promise<Result<true, Exclude<VerifyCodeError, { code: 'closed-here' | 'no-request' }>>> {
  const { auth } = deps
  const body = { purpose: target.purpose, channel: target.channel, value: target.value }
  try {
    if (target.channel === 'email') {
      await auth.api.checkVerificationOTP({
        body: { email: target.value, type: EMAIL_CODE_TYPE[target.purpose], otp: code },
      })
    } else {
      await auth.api.consumePhoneNumberOTP({ body: { phoneNumber: target.value, code } })
    }
  } catch (error) {
    const reason = authErrorCode(error)
    if (target.channel === 'email' && reason === 'USER_NOT_FOUND') {
      // The code passed; the address has no Better Auth user yet. Spent below.
    } else if (reason === 'INVALID_OTP') {
      const tries = await auth.api.codeTries({ body })
      if (!tries.live) return err({ code: 'expired' })
      const left = SIGN_IN.attemptsPerCode - tries.used
      if (left > 0) return err({ code: 'wrong-code', triesLeft: left })
      await auth.api.forgetCode({ body })
      return err({ code: 'too-many-tries' })
    } else if (reason === 'TOO_MANY_ATTEMPTS') {
      await auth.api.forgetCode({ body })
      return err({ code: 'too-many-tries' })
    } else if (reason === 'OTP_EXPIRED' || reason === 'OTP_NOT_FOUND') {
      return err({ code: 'expired' })
    } else {
      throw error
    }
  }
  // Used up: a code that proved an address works once.
  await auth.api.forgetCode({ body })
  return ok(true)
}

/** How many tries the address's current code has left, for an answer that checked nothing. */
export async function triesLeft(
  deps: SignInDeps,
  target: Pick<CodeTarget, 'purpose' | 'channel' | 'value'>,
): Promise<Result<never, Exclude<VerifyCodeError, { code: 'closed-here' | 'no-request' }>>> {
  const tries = await deps.auth.api.codeTries({
    body: { purpose: target.purpose, channel: target.channel, value: target.value },
  })
  if (!tries.live) return err({ code: 'expired' })
  const left = SIGN_IN.attemptsPerCode - tries.used
  return left > 0 ? err({ code: 'wrong-code', triesLeft: left }) : err({ code: 'too-many-tries' })
}
