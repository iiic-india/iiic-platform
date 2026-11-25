'use server'

import { redirect } from 'next/navigation'
import { createLocalReq, getPayload, type PayloadRequest } from 'payload'

import { currentNotice } from '@/lib/privacy/consents'
import { DEFAULT_LANGUAGE } from '@/lib/site/languages'
import config from '@payload-config'

import type { CodeRequestError, SignInChannel, VerifyCodeError } from '../contract'
import { ACCOUNT_COPY, LOGIN_COPY, VERIFY_COPY } from './copy'
import { FIELD_IDS, type SignInFormState } from './formState'
import {
  createAccount,
  currentAttempt,
  requestCode,
  resendCode,
  startAgain,
  verifyCode,
} from './steps'

/**
 * The sign-in forms' server actions (docs/20 §4.1). Each works without JavaScript, as a plain
 * POST the page answers with the form's next state or a redirect (303), and with it in place.
 * Customers are not staff: there is no user to check here, and what guards these is in the steps
 * (src/lib/accounts/signIn/steps.ts): the deployment, the flag, Turnstile, the limits, the
 * sign-in cookie. A fault is logged by its name only, never with what was typed.
 */

async function request(): Promise<PayloadRequest> {
  return createLocalReq({}, await getPayload({ config }))
}

const text = (form: FormData, name: string) => {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

const next = (previous: SignInFormState, change: Partial<SignInFormState>): SignInFormState => ({
  attempt: previous.attempt + 1,
  errors: {},
  values: {},
  ...change,
})

function logFault(where: string, error: unknown): void {
  console.error(`${where} failed (${error instanceof Error ? error.name : 'unknown error'}).`)
}

/** The address step's answer for a refusal, by the field it is about where there is one. */
function codeRequestState(
  previous: SignInFormState,
  channel: SignInChannel,
  error: CodeRequestError | { code: 'no-request' },
  typed: string,
  fieldId: string,
): SignInFormState {
  const values = { [fieldId]: typed }
  switch (error.code) {
    case 'invalid-identifier':
      return next(previous, {
        values,
        errors: {
          [fieldId]: channel === 'email' ? LOGIN_COPY.invalidEmail : LOGIN_COPY.invalidMobile,
        },
      })
    case 'too-many':
      return next(previous, { values, refusal: LOGIN_COPY.tooMany(error.retryAt) })
    case 'busy':
      return next(previous, { values, refusal: LOGIN_COPY.busy })
    case 'check-failed':
      return next(previous, { values, refusal: LOGIN_COPY.checkFailed })
    case 'whatsapp-closed':
      return next(previous, { values, refusal: LOGIN_COPY.whatsappClosed })
    case 'closed-here':
      return next(previous, { values, refusal: LOGIN_COPY.notOpen })
    default:
      return next(previous, { values, refusal: LOGIN_COPY.failed })
  }
}

/** Step 1: the address. A code goes, and the person is sent to the code step. */
export async function sendCode(
  previous: SignInFormState,
  form: FormData,
): Promise<SignInFormState> {
  const channel: SignInChannel = text(form, 'channel') === 'whatsapp' ? 'whatsapp' : 'email'
  const typed = text(form, 'identifier')
  const fieldId = channel === 'email' ? FIELD_IDS.email : FIELD_IDS.mobile
  const token = text(form, 'cf-turnstile-response')
  let state: SignInFormState | null = null
  try {
    const result = await requestCode(
      await request(),
      { channel, identifier: typed, ...(token ? { turnstileToken: token } : {}) },
      new Date(),
      { next: text(form, 'next') },
    )
    if (!result.ok) state = codeRequestState(previous, channel, result.error, typed, fieldId)
  } catch (error) {
    logFault('Asking for a sign-in code', error)
    state = next(previous, { values: { [fieldId]: typed }, refusal: LOGIN_COPY.failed })
  }
  if (state) return state
  redirect('/login/verify')
}

/** The code step's message for a code that did not sign in. */
function codeErrorState(previous: SignInFormState, error: VerifyCodeError, fieldId: string) {
  switch (error.code) {
    case 'wrong-code':
      return next(previous, { errors: { [fieldId]: VERIFY_COPY.wrongCode(error.triesLeft) } })
    case 'expired':
      return next(previous, { errors: { [fieldId]: VERIFY_COPY.expired } })
    case 'too-many-tries':
      return next(previous, { errors: { [fieldId]: VERIFY_COPY.tooManyTries } })
    case 'closed-here':
      return next(previous, { refusal: LOGIN_COPY.notOpen })
    default:
      return null
  }
}

/** Step 2: the code. Signed in, or on to the account step for a new address. */
export async function checkCode(
  previous: SignInFormState,
  form: FormData,
): Promise<SignInFormState> {
  const code = text(form, 'code').replace(/\s/g, '')
  if (!/^\d{6}$/.test(code)) {
    return next(previous, { errors: { [FIELD_IDS.code]: VERIFY_COPY.malformed } })
  }
  let destination = '/login/verify'
  try {
    const req = await request()
    const now = new Date()
    const attempt = await currentAttempt(req, now)
    const result = await verifyCode(req, { code, trustDevice: text(form, 'trust') === 'yes' }, now)
    if (!result.ok) {
      const state = codeErrorState(previous, result.error, FIELD_IDS.code)
      if (state) return state
    } else if (result.value.state === 'signed-in') {
      destination = attempt?.next ?? '/account'
    }
  } catch (error) {
    logFault('Checking a sign-in code', error)
    return next(previous, { refusal: LOGIN_COPY.failed })
  }
  redirect(destination)
}

/** Step 2: "Send a new code". */
export async function sendNewCode(previous: SignInFormState): Promise<SignInFormState> {
  try {
    const result = await resendCode(await request(), new Date())
    if (result.ok) return next(previous, { info: VERIFY_COPY.resent })
    if (result.error.code === 'too-many') {
      return next(previous, { refusal: VERIFY_COPY.tooEarly(result.error.retryAt) })
    }
    if (result.error.code !== 'no-request') {
      return codeRequestState(previous, 'email', result.error, '', FIELD_IDS.code)
    }
  } catch (error) {
    logFault('Sending a new sign-in code', error)
    return next(previous, { refusal: LOGIN_COPY.failed })
  }
  redirect('/login/verify')
}

/** "Use a different address": the attempt is forgotten. */
export async function startWithAnotherAddress(): Promise<void> {
  await startAgain(await request())
  redirect('/login')
}

/** Step 3: the account, for a new address (docs/20 §4.5). */
export async function createMyAccount(
  previous: SignInFormState,
  form: FormData,
): Promise<SignInFormState> {
  const fullName = text(form, 'fullName')
  const values = { [FIELD_IDS.fullName]: fullName }
  const consent = text(form, 'consent') === 'yes'
  const adult = text(form, 'adult') === 'yes'
  const errors: Record<string, string> = {}
  if (!fullName.trim()) errors[FIELD_IDS.fullName] = ACCOUNT_COPY.nameMissing
  if (!consent) errors[FIELD_IDS.consent] = ACCOUNT_COPY.consentMissing
  if (!adult) errors[FIELD_IDS.adult] = ACCOUNT_COPY.adultMissing
  if (Object.keys(errors).length) return next(previous, { values, errors })
  try {
    const req = await request()
    const now = new Date()
    const attempt = await currentAttempt(req, now)
    const result = await createAccount(
      req,
      {
        fullName,
        consent: true,
        adult: true,
        noticeVersionId: Number(text(form, 'noticeVersionId')),
        trustDevice: attempt?.trustDevice ?? false,
      },
      now,
    )
    if (!result.ok) {
      switch (result.error.code) {
        case 'invalid-input':
          return next(previous, {
            values,
            errors: result.error.fields.includes('fullName')
              ? { [FIELD_IDS.fullName]: ACCOUNT_COPY.nameMissing }
              : {},
            refusal: result.error.fields.includes('fullName') ? undefined : LOGIN_COPY.failed,
          })
        case 'notice-changed': {
          const notice = await currentNotice(req.payload, 'account', DEFAULT_LANGUAGE, now)
          return next(previous, {
            values,
            refusal: ACCOUNT_COPY.noticeChanged,
            ...(notice ? { notice: { id: notice.id, text: notice.text } } : {}),
          })
        }
        case 'notice-missing':
          return next(previous, { values, refusal: ACCOUNT_COPY.noticeMissing })
        case 'not-for-under-18':
          return next(previous, { values, refusal: ACCOUNT_COPY.under18 })
        case 'closed-here':
          return next(previous, { values, refusal: LOGIN_COPY.notOpen })
        default:
          // No sign-in in progress, or it ran out: the code step says to start again.
          redirect('/login/verify')
      }
    }
  } catch (error) {
    if (isRedirect(error)) throw error
    logFault('Creating an account', error)
    return next(previous, { values, refusal: LOGIN_COPY.failed })
  }
  redirect('/account')
}

/** Step 3's "No, thanks": nothing is stored, and the attempt is forgotten. */
export async function declineAccount(): Promise<void> {
  await startAgain(await request())
  redirect('/')
}

/** Next.js's redirect travels as a thrown error; it must reach Next.js, not the fault log. */
function isRedirect(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')
}
