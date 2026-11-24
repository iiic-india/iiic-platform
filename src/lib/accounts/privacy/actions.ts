'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createLocalReq, getPayload, type PayloadRequest } from 'payload'

import {
  detailRequestInput,
  SIGN_IN,
  SIGN_IN_CHANNELS,
  type SignInChannel,
} from '@/lib/accounts/contract'
import { env } from '@/lib/env'
import { actsHere } from '@/lib/messaging/deployment'
import { reportError } from '@/lib/monitoring/sentry'
import { formatIstDate, formatIstTime, istDay } from '@/lib/time/ist'
import config from '@payload-config'

import { giveConsent, withdrawConsent } from './consents'
import { DETAIL_COPY, REQUEST_COPY } from './copy'
import { CLOSE_PATH, CLOSED_PATH, isGivablePurpose, outcomeHref, PRIVACY_PATH } from './outcome'
import { createOwnRequest } from './requests'
import {
  endedByClosing,
  isConsentPurpose,
  isOwnRequestType,
  signedInRecently,
  SUMMARY_MAX,
} from './rules'
import {
  closeAccount,
  confirmDetail,
  requestDetailCode,
  requireAccount,
  signOut,
  signOutEverywhere,
} from './seams'
import type { DetailConfirmState, DetailRequestState, RequestFormState } from './state'

/**
 * The privacy page's server actions (docs/20 §7.5). Each calls `requireAccount` before it reads
 * the form (CLAUDE.md #6; docs/20 §1), then the account's own functions, which touch only its
 * records and act on no preview (D-122). One-button forms answer with a redirect back to the page
 * and the outcome's code (src/lib/accounts/privacy/outcome.ts), so they work without JavaScript;
 * the request and the second detail keep what was typed in their action state. A fault is
 * logged by its kind only, never with what the form held, and reported.
 */

async function requestFor(): Promise<PayloadRequest> {
  const payload = await getPayload({ config })
  // The browser's headers come along: a consent's evidence and the audit log read the address
  // and the browser from them.
  return createLocalReq({ req: { headers: new Headers(await headers()) } }, payload)
}

async function fault(error: unknown, task: string): Promise<void> {
  console.error(
    `My IIIC privacy: ${task} failed (${error instanceof Error ? error.name : 'unknown error'}).`,
  )
  await reportError(error, { task: `account-privacy-${task}` })
}

const field = (form: FormData, name: string): string => {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

/** "Withdraw" beside a consent in force: every record's consent of that purpose, at once. */
export async function withdrawConsentAction(form: FormData): Promise<void> {
  const account = await requireAccount({ next: PRIVACY_PATH })
  const purpose = field(form, 'purpose')
  // The account consent ends by closing the account (D-113).
  if (endedByClosing(purpose)) redirect(CLOSE_PATH)
  let target: string
  try {
    const result = await withdrawConsent(await requestFor(), account, { purpose }, new Date())
    target = result.ok
      ? outcomeHref({
          tone: 'done',
          code: 'withdrawn',
          section: 'agreed',
          purpose: isConsentPurpose(purpose) ? purpose : null,
        })
      : outcomeHref({ tone: 'error', code: result.error.code, section: 'agreed' })
  } catch (error) {
    await fault(error, 'withdraw')
    target = outcomeHref({ tone: 'error', code: 'failed', section: 'agreed' })
  }
  redirect(target)
}

/** A marketing consent, under the notice the page showed beside its unticked box. */
export async function giveConsentAction(form: FormData): Promise<void> {
  const account = await requireAccount({ next: PRIVACY_PATH })
  const purpose = field(form, 'purpose')
  if (!isGivablePurpose(purpose)) {
    redirect(outcomeHref({ tone: 'error', code: 'failed', section: 'messages' }))
  }
  // Never ticked for the person (CLAUDE.md #9): an unticked box is an answer to check.
  if (field(form, 'consent') !== 'yes') {
    redirect(outcomeHref({ tone: 'error', code: 'unticked', section: 'messages', purpose }))
  }
  const noticeVersionId = Number(field(form, 'noticeVersionId'))
  let target: string
  try {
    const result = await giveConsent(
      await requestFor(),
      account,
      { purpose, noticeVersionId, consent: true },
      new Date(),
    )
    target = result.ok
      ? outcomeHref({ tone: 'done', code: 'given', section: 'messages', purpose })
      : result.error.code === 'already-given'
        ? outcomeHref({ tone: 'done', code: 'already-given', section: 'messages', purpose })
        : outcomeHref({ tone: 'error', code: result.error.code, section: 'messages', purpose })
  } catch (error) {
    await fault(error, 'give')
    target = outcomeHref({ tone: 'error', code: 'failed', section: 'messages', purpose })
  }
  redirect(target)
}

/** A request about one's data: recorded for the office, acknowledged by O4 or O7. */
export async function createRequestAction(
  previous: RequestFormState,
  form: FormData,
): Promise<RequestFormState> {
  const account = await requireAccount({ next: PRIVACY_PATH })
  const type = field(form, 'type')
  const summary = field(form, 'summary')
  const values = { type, summary }
  const key = (previous?.key ?? 0) + 1
  const errors: RequestFormState['errors'] = {}
  if (!isOwnRequestType(type)) errors.type = REQUEST_COPY.errors.type
  const words = summary.trim()
  if (!words) errors.summary = REQUEST_COPY.errors.summary
  else if (words.length > SUMMARY_MAX) errors.summary = REQUEST_COPY.errors.summaryLong
  const refused = (refusal: keyof typeof REQUEST_COPY.refusals): RequestFormState => ({
    status: 'refused',
    errors: {},
    refusal: REQUEST_COPY.refusals[refusal],
    signInAgain: refusal === 'sign-in-again',
    values,
    key,
  })
  if (!isOwnRequestType(type) || errors.summary) {
    return { status: 'invalid', errors, refusal: null, signInAgain: false, values, key }
  }

  let result: Awaited<ReturnType<typeof createOwnRequest>>
  try {
    result = await createOwnRequest(
      await requestFor(),
      account,
      { type, summary: words },
      new Date(),
    )
  } catch (error) {
    await fault(error, 'request')
    return refused('failed')
  }
  if (result.ok) redirect(outcomeHref({ tone: 'done', code: 'request-sent', section: 'requests' }))
  if (result.error.code === 'invalid-input') {
    return {
      status: 'invalid',
      errors: { summary: REQUEST_COPY.errors.summary },
      refusal: null,
      signInAgain: false,
      values,
      key,
    }
  }
  return refused(result.error.code)
}

/**
 * "Sign in again" before a copy, an erasure or closing (D-121): A's `requireAccount` with the
 * ten minutes sends a session older than that to sign in again, and back here afterwards.
 */
export async function signInAgainAction(form: FormData): Promise<void> {
  await requireAccount({ next: PRIVACY_PATH })
  const toClose = field(form, 'back') === 'close'
  await requireAccount({
    next: toClose ? CLOSE_PATH : PRIVACY_PATH,
    recentMinutes: SIGN_IN.recentSignInMinutes,
  })
  redirect(toClose ? CLOSE_PATH : `${PRIVACY_PATH}#requests`)
}

/** "Sign out everywhere": every session of the account but this one (docs/20 §4.7). */
export async function signOutEverywhereAction(): Promise<void> {
  const account = await requireAccount({ next: PRIVACY_PATH })
  let target: string
  try {
    if (!actsHere(env().VERCEL_ENV)) {
      target = outcomeHref({ tone: 'error', code: 'closed-here', section: 'devices' })
    } else {
      const count = await signOutEverywhere(await requestFor(), account)
      target = outcomeHref({ tone: 'done', code: 'signed-out', section: 'devices', count })
    }
  } catch (error) {
    await fault(error, 'sign-out-everywhere')
    target = outcomeHref({ tone: 'error', code: 'failed', section: 'devices' })
  }
  redirect(target)
}

/**
 * "Close my account" (docs/20 §7.6): only within ten minutes of signing in (D-121). Closing is
 * A's `CloseAccount`, which deletes the sign-in user, its sessions and the account, detaches the
 * records, withdraws the account consent and sends A2; then this browser's cookies go.
 */
export async function closeAccountAction(): Promise<void> {
  const account = await requireAccount({ next: CLOSE_PATH })
  if (!actsHere(env().VERCEL_ENV)) {
    redirect(outcomeHref({ tone: 'error', code: 'closed-here', section: 'close' }, CLOSE_PATH))
  }
  if (!signedInRecently(account, new Date())) {
    redirect(outcomeHref({ tone: 'error', code: 'sign-in-again', section: 'close' }, CLOSE_PATH))
  }
  let target: string
  try {
    const result = await closeAccount(await requestFor(), {
      accountId: account.accountId,
      reason: 'person',
    })
    target = result.ok
      ? CLOSED_PATH
      : outcomeHref({ tone: 'error', code: 'failed', section: 'close' }, CLOSE_PATH)
  } catch (error) {
    await fault(error, 'close')
    target = outcomeHref({ tone: 'error', code: 'failed', section: 'close' }, CLOSE_PATH)
  }
  if (target === CLOSED_PATH) {
    try {
      await signOut()
    } catch {
      // The session went with the account; only this browser's cookie is left, and it opens nothing.
    }
  }
  redirect(target)
}

const channelOf = (value: string): SignInChannel =>
  (SIGN_IN_CHANNELS as readonly string[]).includes(value) ? (value as SignInChannel) : 'email'

/** When the person may ask again: the time today, or the time and the day (VOICE.md). */
function whenAgain(at: Date, now: Date): string {
  return istDay(at) === istDay(now)
    ? formatIstTime(at)
    : `${formatIstTime(at)} on ${formatIstDate(at)}`
}

/** A second detail, step one: a code to the email or the mobile typed (docs/20 §4.6). */
export async function requestDetailAction(
  previous: DetailRequestState,
  form: FormData,
): Promise<DetailRequestState> {
  const account = await requireAccount({ next: PRIVACY_PATH })
  const channel = channelOf(field(form, 'channel'))
  const value = field(form, 'identifier')
  const key = (previous?.key ?? 0) + 1
  const answer = (status: DetailRequestState['status'], error: string | null, masked = null) => ({
    status,
    channel,
    value,
    masked,
    error,
    key,
  })
  const parsed = detailRequestInput.safeParse({ channel, identifier: value })
  if (!parsed.success) return answer('invalid', DETAIL_COPY[channel].invalid)
  const now = new Date()
  try {
    const result = await requestDetailCode(await requestFor(), account, parsed.data, now)
    if (result.ok) {
      return { status: 'sent', channel, value, masked: result.value.masked, error: null, key }
    }
    const refusal = result.error
    if (refusal.code === 'invalid-identifier')
      return answer('invalid', DETAIL_COPY[channel].invalid)
    if (refusal.code === 'too-many') {
      return answer('refused', DETAIL_COPY.refusals['too-many'](whenAgain(refusal.retryAt, now)))
    }
    return answer('refused', DETAIL_COPY.refusals[refusal.code])
  } catch (error) {
    await fault(error, 'detail-code')
    return answer('refused', DETAIL_COPY.refusals.failed)
  }
}

/** A second detail, step two: the code, which adds it and attaches its records. */
export async function confirmDetailAction(
  previous: DetailConfirmState,
  form: FormData,
): Promise<DetailConfirmState> {
  const account = await requireAccount({ next: PRIVACY_PATH })
  const code = field(form, 'code').replace(/\s/g, '')
  const key = (previous?.key ?? 0) + 1
  if (!/^\d{6}$/.test(code)) return { status: 'invalid', error: DETAIL_COPY.codeInvalid, key }
  let result: Awaited<ReturnType<typeof confirmDetail>>
  try {
    result = await confirmDetail(await requestFor(), account, { code }, new Date())
  } catch (error) {
    await fault(error, 'detail-confirm')
    return { status: 'refused', error: DETAIL_COPY.refusals.failed, key }
  }
  if (result.ok) redirect(outcomeHref({ tone: 'done', code: 'detail-added', section: 'contact' }))
  const refusal = result.error
  if (refusal.code === 'wrong-code') {
    return { status: 'invalid', error: DETAIL_COPY.wrongCode(refusal.triesLeft), key }
  }
  return { status: 'refused', error: DETAIL_COPY.refusals[refusal.code], key }
}
