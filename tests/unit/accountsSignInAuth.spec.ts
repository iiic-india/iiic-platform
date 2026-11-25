// @vitest-environment node
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { codeIdentifier, placeholderEmail } from '@/lib/accounts/auth/codes'
import { customerAuthOptions, whatsappCourier } from '@/lib/accounts/auth/options'
import { CUSTOMER_AUTH, SESSION_COOKIE_PREFIX, SIGN_IN } from '@/lib/accounts/contract'

// Better Auth 1.7.27 as installed, on its in-memory adapter, with exactly the options the platform
// uses (docs/20 §3.4): the order the sign-in step relies on (a right code for an address with no
// user passes before USER_NOT_FOUND), the tries, the identifiers IIIC's plugin uses for a code,
// the sessions' lifetimes and cookies, and that IIIC's endpoints are server-only. An upgrade that
// changes any of it fails here. Obviously fake addresses only.

const SECRET = 'unit-only-better-auth-secret-0000000000000000'
const EMAIL = 'someone@fake.example.invalid'
const MOBILE = '+919000000000'

type Db = Record<string, Record<string, unknown>[]>

function makeAuth(db: Db, testCode?: string, log: (message: string) => void = () => {}) {
  return betterAuth(
    customerAuthOptions({
      secret: SECRET,
      siteUrl: 'https://fake.example.invalid',
      trustedOrigins: ['https://fake.example.invalid'],
      database: memoryAdapter(db),
      ...(testCode ? { testCode } : {}),
      log,
    }),
  )
}

const code = (error: unknown) => (error as { body?: { code?: string } }).body?.code

async function failure(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise
  } catch (error) {
    return code(error)
  }
  return 'no-error'
}

let db: Db
let auth: ReturnType<typeof makeAuth>

beforeEach(() => {
  db = { users: [], sessions: [], identities: [], verifications: [] }
  auth = makeAuth(db)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the tables', () => {
  it('are the four of the customer_auth schema, under their own names', () => {
    expect(Object.values(CUSTOMER_AUTH.tables)).toEqual([
      'users',
      'sessions',
      'identities',
      'verifications',
    ])
  })
})

describe('an email code', () => {
  it('is six digits, kept hashed under a hashed identifier', async () => {
    const otp = await auth.api.createVerificationOTP({ body: { email: EMAIL, type: 'sign-in' } })
    expect(otp).toMatch(/^\d{6}$/)
    const stored = JSON.stringify(db.verifications)
    expect(stored).not.toContain(otp)
    expect(stored).not.toContain(EMAIL)
  })

  it('is the fixed test code where ACCOUNTS_TEST_CODE is set', async () => {
    const fixed = makeAuth({ users: [], sessions: [], identities: [], verifications: [] }, '135790')
    expect(await fixed.api.createVerificationOTP({ body: { email: EMAIL, type: 'sign-in' } })).toBe(
      '135790',
    )
  })

  it('passes before USER_NOT_FOUND for an address with no user, and is put back for the platform to spend', async () => {
    const otp = await auth.api.createVerificationOTP({ body: { email: EMAIL, type: 'sign-in' } })
    expect(
      await failure(
        auth.api.checkVerificationOTP({ body: { email: EMAIL, type: 'sign-in', otp } }),
      ),
    ).toBe('USER_NOT_FOUND')
    // Still there: the platform spends it at once (forgetCode).
    expect(
      (await auth.api.codeTries({ body: { purpose: 'signIn', channel: 'email', value: EMAIL } }))
        .live,
    ).toBe(true)
    await auth.api.forgetCode({ body: { purpose: 'signIn', channel: 'email', value: EMAIL } })
    expect(
      await failure(
        auth.api.checkVerificationOTP({ body: { email: EMAIL, type: 'sign-in', otp } }),
      ),
    ).toBe('INVALID_OTP')
  })

  it('answers a wrong code without saying whether a user exists, and counts the try', async () => {
    await auth.api.createVerificationOTP({ body: { email: EMAIL, type: 'sign-in' } })
    expect(
      await failure(
        auth.api.checkVerificationOTP({ body: { email: EMAIL, type: 'sign-in', otp: '000000' } }),
      ),
    ).toBe('INVALID_OTP')
    expect(
      await auth.api.codeTries({ body: { purpose: 'signIn', channel: 'email', value: EMAIL } }),
    ).toEqual({
      live: true,
      used: 1,
    })
  })

  it('ends at the fifth wrong try: even the right code no longer works', async () => {
    const otp = await auth.api.createVerificationOTP({ body: { email: EMAIL, type: 'sign-in' } })
    const wrong = otp === '000000' ? '111111' : '000000'
    for (let i = 0; i < SIGN_IN.attemptsPerCode; i += 1) {
      expect(
        await failure(
          auth.api.checkVerificationOTP({ body: { email: EMAIL, type: 'sign-in', otp: wrong } }),
        ),
      ).toBe('INVALID_OTP')
    }
    expect(
      (await auth.api.codeTries({ body: { purpose: 'signIn', channel: 'email', value: EMAIL } }))
        .used,
    ).toBe(5)
    expect(
      await failure(
        auth.api.checkVerificationOTP({ body: { email: EMAIL, type: 'sign-in', otp } }),
      ),
    ).toBe('TOO_MANY_ATTEMPTS')
  })

  it('runs out after ten minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const otp = await auth.api.createVerificationOTP({ body: { email: EMAIL, type: 'sign-in' } })
    vi.setSystemTime(Date.now() + SIGN_IN.codeTtlSeconds * 1000 + 1000)
    expect(
      await failure(
        auth.api.checkVerificationOTP({ body: { email: EMAIL, type: 'sign-in', otp } }),
      ),
    ).toBe('OTP_EXPIRED')
  })

  it('keeps a second detail’s code apart from a sign-in code to the same address', () => {
    expect(codeIdentifier('signIn', 'email', EMAIL)).not.toBe(
      codeIdentifier('addDetail', 'email', EMAIL),
    )
    expect(codeIdentifier('signIn', 'whatsapp', MOBILE)).toBe(`phone-number-otp-${MOBILE}`)
  })

  it('is never sent by Better Auth itself: its sender refuses, and the log says so without the address', async () => {
    const logged: string[] = []
    const watched = makeAuth(db, undefined, (message) => logged.push(message))
    await watched.api.createCustomer({ body: { channel: 'email', value: EMAIL } })
    await watched.api.sendVerificationOTP({ body: { email: EMAIL, type: 'sign-in' } })
    expect(logged.length).toBeGreaterThan(0)
    expect(logged.join(' ')).not.toContain(EMAIL)
  })
})

describe('a WhatsApp code', () => {
  it('reaches the platform’s courier only, and is spent when checked', async () => {
    let sent = ''
    await whatsappCourier.run(
      async (value) => {
        sent = value
      },
      () => auth.api.sendPhoneNumberOTP({ body: { phoneNumber: MOBILE } }),
    )
    expect(sent).toMatch(/^\d{6}$/)
    await auth.api.consumePhoneNumberOTP({ body: { phoneNumber: MOBILE, code: sent } })
    expect(
      await failure(auth.api.consumePhoneNumberOTP({ body: { phoneNumber: MOBILE, code: sent } })),
    ).toBe('OTP_NOT_FOUND')
  })

  it('refuses a number that is not E.164', async () => {
    expect(
      await failure(
        whatsappCourier.run(
          async () => {},
          () => auth.api.sendPhoneNumberOTP({ body: { phoneNumber: '90000 00000' } }),
        ),
      ),
    ).toBe('INVALID_PHONE_NUMBER')
  })

  it('is made only inside the sign-in action', async () => {
    await expect(auth.api.sendPhoneNumberOTP({ body: { phoneNumber: MOBILE } })).rejects.toThrow()
  })
})

describe('IIIC’s plugin', () => {
  it('makes a user for a proven email once, and for a mobile with a placeholder address', async () => {
    const first = await auth.api.createCustomer({ body: { channel: 'email', value: EMAIL } })
    const again = await auth.api.createCustomer({ body: { channel: 'email', value: EMAIL } })
    expect(first.created).toBe(true)
    expect(again).toEqual({ userId: first.userId, created: false })
    const mobile = await auth.api.createCustomer({ body: { channel: 'whatsapp', value: MOBILE } })
    const user = db.users?.find((row) => row.id === mobile.userId)
    expect(user?.email).toBe(placeholderEmail(MOBILE))
    expect(user?.phoneNumberVerified).toBe(true)
    expect(user?.name).toBe('')
  })

  it('starts a kept session for thirty days, with its cookie', async () => {
    const { userId } = await auth.api.createCustomer({ body: { channel: 'email', value: EMAIL } })
    const { headers, response } = await auth.api.startSession({
      body: { userId, trusted: true },
      headers: new Headers({ 'user-agent': 'Fake browser' }),
      returnHeaders: true,
    })
    const days =
      (new Date(response.expiresAt).getTime() - new Date(response.createdAt).getTime()) / 86_400_000
    expect(Math.round(days)).toBe(SIGN_IN.trustedSessionDays)
    const cookies = headers.getSetCookie().join('\n')
    expect(cookies).toContain(`__Secure-${SESSION_COOKIE_PREFIX}.session_token=`)
    expect(cookies).toMatch(/Max-Age=2592000/)
    expect(cookies).toMatch(/HttpOnly/)
    expect(cookies).toMatch(/SameSite=Lax/)
    expect(cookies).not.toContain('dont_remember')
    // No IP address is kept with the session.
    expect(db.sessions?.[0]?.ipAddress ?? '').toBe('')
  })

  it('starts an unkept session for a day at most, ended with the browser', async () => {
    const { userId } = await auth.api.createCustomer({ body: { channel: 'email', value: EMAIL } })
    const { headers, response } = await auth.api.startSession({
      body: { userId, trusted: false },
      returnHeaders: true,
    })
    const hours =
      (new Date(response.expiresAt).getTime() - new Date(response.createdAt).getTime()) / 3_600_000
    expect(Math.round(hours)).toBe(SIGN_IN.untrustedSessionHours)
    const cookies = headers.getSetCookie()
    const session = cookies.find((line) => line.includes('.session_token='))
    expect(session).toBeDefined()
    expect(session).not.toMatch(/Max-Age/)
    expect(
      cookies.some((line) => line.startsWith(`__Secure-${SESSION_COOKIE_PREFIX}.dont_remember=`)),
    ).toBe(true)
  })

  it('reads the session back from its cookie, and never slides it', async () => {
    const { userId } = await auth.api.createCustomer({ body: { channel: 'email', value: EMAIL } })
    const { headers } = await auth.api.startSession({
      body: { userId, trusted: true },
      returnHeaders: true,
    })
    const cookie = headers
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .join('; ')
    const found = await auth.api.getSession({ headers: new Headers({ cookie }) })
    expect(found?.user.id).toBe(userId)
    const again = await auth.api.getSession({
      headers: new Headers({ cookie }),
      returnHeaders: true,
    })
    expect(again.headers?.getSetCookie?.() ?? []).toEqual([])
  })

  it('ends the session the browser carried once a new one starts: signing in again leaves one (D-130)', async () => {
    const { userId } = await auth.api.createCustomer({ body: { channel: 'email', value: EMAIL } })
    const cookieOf = (headers: Headers) =>
      headers
        .getSetCookie()
        .map((line) => line.split(';')[0])
        .join('; ')
    const first = await auth.api.startSession({
      body: { userId, trusted: true },
      returnHeaders: true,
    })
    expect(first.response.replaced).toBe(false)
    const carried = cookieOf(first.headers)
    // "Sign in again" from the same browser: its cookie travels with the request.
    const second = await auth.api.startSession({
      body: { userId, trusted: true },
      headers: new Headers({ cookie: carried }),
      returnHeaders: true,
    })
    expect(second.response.replaced).toBe(true)
    expect(db.sessions?.map((row) => row.id)).toEqual([second.response.sessionId])
    expect(await auth.api.getSession({ headers: new Headers({ cookie: carried }) })).toBeNull()
    const now = await auth.api.getSession({
      headers: new Headers({ cookie: cookieOf(second.headers) }),
    })
    expect(now?.session.id).toBe(second.response.sessionId)
  })

  it('leaves every other device’s session alone, and ends nothing for a cookie it cannot verify', async () => {
    const { userId } = await auth.api.createCustomer({ body: { channel: 'email', value: EMAIL } })
    const elsewhere = await auth.api.startSession({ body: { userId, trusted: true } })
    const token = String(db.sessions?.find((row) => row.id === elsewhere.sessionId)?.token)
    // That device's token under a signature this server never made.
    const forged = `__Secure-${SESSION_COOKIE_PREFIX}.session_token=${token}.${'A'.repeat(43)}=`
    const here = await auth.api.startSession({
      body: { userId, trusted: false },
      headers: new Headers({ cookie: forged }),
    })
    expect(here.replaced).toBe(false)
    expect(db.sessions?.map((row) => row.id).sort()).toEqual(
      [elsewhere.sessionId, here.sessionId].sort(),
    )
  })

  it('is reachable on no HTTP route', async () => {
    for (const path of [
      '/api/auth/start-session',
      '/api/auth/create-customer',
      '/api/auth/forget-code',
    ]) {
      const response = await auth.handler(
        new Request(`https://fake.example.invalid${path}`, { method: 'POST' }),
      )
      expect(response.status).toBe(404)
    }
    expect(auth.api.startSession.path).toBeUndefined()
    expect(auth.api.createCustomer.path).toBeUndefined()
    expect(auth.api.forgetCode.path).toBeUndefined()
    expect(auth.api.codeTries.path).toBeUndefined()
    expect(auth.api.addDetail.path).toBeUndefined()
  })
})
