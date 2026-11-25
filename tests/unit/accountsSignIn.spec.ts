// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { ADD_DETAIL_COOKIE, SIGN_IN, SIGN_IN_COOKIE } from '@/lib/accounts/contract'
import {
  attemptCookie,
  clearAttempt,
  openAttempt,
  readAttempt,
  safeNext,
  sealAttempt,
  writeAttempt,
  type Attempt,
  type CookieJar,
} from '@/lib/accounts/signIn/cookie'
import { ACCOUNT_COPY, LOGIN_COPY, VERIFY_COPY } from '@/lib/accounts/signIn/copy'
import { deviceName } from '@/lib/accounts/signIn/device'
import { deploymentGate } from '@/lib/accounts/signIn/gate'
import {
  identifierHash,
  maskIdentifier,
  normaliseIdentifier,
} from '@/lib/accounts/signIn/identifier'
import { limitVerdict, type RequestTimes } from '@/lib/accounts/signIn/limits'

// The pure parts of sign-in (docs/20 §4): the limits at their edges (D-116), the address as it
// is stored, shown and counted, the sealed sign-in cookie, where sign-in may act (D-122), the
// devices list's names, and the words. Fake addresses only.

const SECRET = 'test-only-better-auth-secret-0000000000000000'
const NOW = new Date('2099-03-04T11:00:00+05:30')
const ago = (ms: number) => new Date(NOW.getTime() - ms)
const MINUTE = 60_000
const HOUR = 60 * MINUTE

const times = (change: Partial<RequestTimes>): RequestTimes => ({
  identifier: [],
  network: [],
  site: 0,
  ...change,
})

describe('the limits (D-116)', () => {
  it('let the first code through', () => {
    expect(limitVerdict(times({}), NOW)).toEqual({ ok: true })
  })

  it('refuse a second code within a minute, and say when one may be asked', () => {
    const verdict = limitVerdict(times({ identifier: [ago(20_000)] }), NOW)
    expect(verdict).toEqual({
      ok: false,
      code: 'too-many',
      retryAt: new Date(ago(20_000).getTime() + MINUTE),
    })
    expect(limitVerdict(times({ identifier: [ago(61_000)] }), NOW)).toEqual({ ok: true })
  })

  it('refuse the sixth in an hour', () => {
    const five = [2, 10, 20, 30, 50].map((minutes) => ago(minutes * MINUTE))
    const verdict = limitVerdict(times({ identifier: five }), NOW)
    expect(verdict.ok).toBe(false)
    // Free again when the oldest of the five leaves the hour.
    expect(verdict).toMatchObject({ retryAt: new Date(ago(50 * MINUTE).getTime() + HOUR) })
    expect(limitVerdict(times({ identifier: five.slice(0, 4) }), NOW)).toEqual({ ok: true })
  })

  it('refuse the eleventh in a day', () => {
    const ten = Array.from({ length: 10 }, (_, i) => ago((i + 2) * HOUR))
    const verdict = limitVerdict(times({ identifier: ten }), NOW)
    expect(verdict).toMatchObject({
      ok: false,
      code: 'too-many',
      retryAt: new Date(ago(11 * HOUR).getTime() + 24 * HOUR),
    })
    expect(limitVerdict(times({ identifier: ten.slice(0, 9) }), NOW)).toEqual({ ok: true })
  })

  it('refuse the twenty-first from one network address in an hour', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => ago((i + 1) * 2 * MINUTE))
    expect(limitVerdict(times({ network: twenty }), NOW)).toMatchObject({
      ok: false,
      code: 'too-many',
    })
    expect(limitVerdict(times({ network: twenty.slice(0, 19) }), NOW)).toEqual({ ok: true })
  })

  it('count no network address the server cannot see', () => {
    expect(limitVerdict(times({ network: null }), NOW)).toEqual({ ok: true })
  })

  it('say the site is busy past 120 codes in ten minutes, naming nobody', () => {
    expect(limitVerdict(times({ site: 120 }), NOW)).toEqual({ ok: false, code: 'busy' })
    expect(limitVerdict(times({ site: 119 }), NOW)).toEqual({ ok: true })
  })
})

describe('the address', () => {
  it('is stored as the platform stores it: email in small letters, mobile in E.164', () => {
    expect(normaliseIdentifier('email', '  Someone@Fake.Example.INVALID ')).toBe(
      'someone@fake.example.invalid',
    )
    expect(normaliseIdentifier('email', 'not an address')).toBeNull()
    expect(normaliseIdentifier('whatsapp', '90000 00000')).toBe('+919000000000')
    expect(normaliseIdentifier('whatsapp', '12345')).toBeNull()
  })

  it('shows masked on the code step', () => {
    expect(maskIdentifier('email', 'abhay@gmail.com')).toBe('a••••@gmail.com')
    expect(maskIdentifier('whatsapp', '+919000012345')).toBe('+91 ••••• •2345')
  })

  it('is counted by a keyed hash that holds no address and differs by channel and key', () => {
    const hash = identifierHash(SECRET, 'email', 'someone@fake.example.invalid')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).toBe(identifierHash(SECRET, 'email', 'someone@fake.example.invalid'))
    expect(hash).not.toBe(identifierHash(SECRET, 'whatsapp', 'someone@fake.example.invalid'))
    expect(hash).not.toBe(
      identifierHash(`${SECRET}-other`, 'email', 'someone@fake.example.invalid'),
    )
  })
})

describe('the sign-in cookie', () => {
  const attempt: Attempt = {
    v: 1,
    purpose: 'signIn',
    channel: 'email',
    address: 'someone@fake.example.invalid',
    requestId: 41,
    sentAt: NOW.getTime(),
  }

  it('is sealed: the browser can neither read the address nor change it', async () => {
    const sealed = await sealAttempt(SECRET, attempt, NOW)
    expect(sealed).not.toContain('someone')
    expect(sealed.split('.')).toHaveLength(5)
    expect(await openAttempt(SECRET, sealed, NOW)).toEqual(attempt)
    const changed = `${sealed.slice(0, -4)}AAAA`
    expect(await openAttempt(SECRET, changed, NOW)).toBeNull()
    expect(await openAttempt(`${SECRET}-other`, sealed, NOW)).toBeNull()
  })

  it('runs out after fifteen minutes', async () => {
    const sealed = await sealAttempt(SECRET, attempt, NOW)
    const later = new Date(NOW.getTime() + SIGN_IN_COOKIE.maxAgeSeconds * 1000 + 1000)
    expect(await openAttempt(SECRET, sealed, later)).toBeNull()
  })

  it('never holds a code', async () => {
    const withCode = { ...attempt, code: '123456' } as unknown as Attempt
    const sealed = await sealAttempt(SECRET, withCode, NOW)
    expect(await openAttempt(SECRET, sealed, NOW)).toBeNull()
  })

  it('has a cookie of its own for each purpose: a sign-in’s on /login, a second detail’s on /account (D-129)', async () => {
    expect(attemptCookie('signIn')).toBe(SIGN_IN_COOKIE)
    expect(attemptCookie('addDetail')).toBe(ADD_DETAIL_COOKIE)
    expect(ADD_DETAIL_COOKIE.name).not.toBe(SIGN_IN_COOKIE.name)
    const written: { name: string; path: string; maxAge?: number; httpOnly?: boolean }[] = []
    const jar: CookieJar = {
      get: () => undefined,
      set: (name, _value, options) => {
        written.push({ name, ...options })
      },
      delete: (name, options) => {
        written.push({ name, path: options.path })
      },
    }
    await writeAttempt(jar, SECRET, { ...attempt, purpose: 'addDetail', accountId: 3 }, NOW, true)
    clearAttempt(jar, true, 'addDetail')
    await writeAttempt(jar, SECRET, attempt, NOW, true)
    clearAttempt(jar, true, 'signIn')
    expect(written.map(({ name, path }) => `${name} ${path}`)).toEqual([
      'iiic-add-detail /account',
      'iiic-add-detail /account',
      'iiic-sign-in /login',
      'iiic-sign-in /login',
    ])
    expect(written[0]).toMatchObject({ httpOnly: true, maxAge: ADD_DETAIL_COOKIE.maxAgeSeconds })
    expect(written[2]).toMatchObject({ httpOnly: true, maxAge: SIGN_IN_COOKIE.maxAgeSeconds })
  })

  it('is read by purpose: a detail code asked for and not confirmed never stands in for a sign-in', async () => {
    // A browser holding both: a second detail's attempt from /account/privacy/contact, and a
    // sign-in begun at /login within its fifteen minutes.
    const values = new Map<string, string>()
    const jar: CookieJar = {
      get: (name) => values.get(name),
      set: (name, value) => {
        values.set(name, value)
      },
      delete: (name) => {
        values.delete(name)
      },
    }
    const detail: Attempt = { ...attempt, purpose: 'addDetail', accountId: 3, requestId: 42 }
    await writeAttempt(jar, SECRET, detail, NOW, true)
    expect(await readAttempt(jar, SECRET, NOW, 'signIn')).toBeNull()
    await writeAttempt(jar, SECRET, attempt, NOW, true)
    expect(await readAttempt(jar, SECRET, NOW, 'signIn')).toEqual(attempt)
    expect(await readAttempt(jar, SECRET, NOW, 'addDetail')).toEqual(detail)
    // An attempt of one purpose put in the other's cookie is not read as that purpose.
    values.set(SIGN_IN_COOKIE.name, values.get(ADD_DETAIL_COOKIE.name) as string)
    expect(await readAttempt(jar, SECRET, NOW, 'signIn')).toBeNull()
  })

  it('keeps `next` only when it is a path under /account', () => {
    expect(safeNext('/account/bookings')).toBe('/account/bookings')
    expect(safeNext('/account')).toBe('/account')
    expect(safeNext('//evil.example')).toBeUndefined()
    expect(safeNext('https://evil.example/account')).toBeUndefined()
    expect(safeNext('/admin')).toBeUndefined()
    expect(safeNext('/account//x')).toBeUndefined()
  })
})

describe('where sign-in may act (D-122)', () => {
  const secret = { BETTER_AUTH_SECRET: SECRET }
  it('acts locally, in CI and on production, with the secret', () => {
    expect(deploymentGate({ ...secret, VERCEL_ENV: undefined })).toBe('open')
    expect(deploymentGate({ ...secret, VERCEL_ENV: 'production' })).toBe('open')
  })
  it('acts on no preview, which shares production’s database', () => {
    expect(deploymentGate({ ...secret, VERCEL_ENV: 'preview' })).toBe('preview')
    expect(deploymentGate({ ...secret, VERCEL_ENV: 'development' })).toBe('preview')
  })
  it('is closed without the secret', () => {
    expect(deploymentGate({ BETTER_AUTH_SECRET: undefined, VERCEL_ENV: 'production' })).toBe(
      'no-secret',
    )
  })
})

describe('the devices list', () => {
  it('names the browser and system only', () => {
    expect(
      deviceName(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36',
      ),
    ).toBe('Chrome on Android')
    expect(
      deviceName(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari on iOS')
    expect(
      deviceName(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0',
      ),
    ).toBe('Edge on Windows')
    expect(deviceName('')).toBeNull()
    expect(deviceName('curl/8.0')).toBeNull()
  })
})

describe('the words (VOICE.md; docs/20 §4.1)', () => {
  const all = JSON.stringify([LOGIN_COPY, VERIFY_COPY, ACCOUNT_COPY])
  const said = [
    LOGIN_COPY.tooMany(NOW),
    VERIFY_COPY.wrongCode(3),
    VERIFY_COPY.wrongCode(1),
    VERIFY_COPY.sent('a••••@gmail.com'),
    VERIFY_COPY.tooEarly(NOW),
  ].join(' ')

  it('use docs/20’s lines as written there', () => {
    expect(LOGIN_COPY.heading).toBe('Sign in to My IIIC')
    expect(LOGIN_COPY.emailButton).toBe('Send me a code')
    expect(VERIFY_COPY.sent('a••••@gmail.com')).toBe(
      'If a••••@gmail.com can receive our messages, a six-digit code is on its way. It works for 10 minutes.',
    )
    expect(VERIFY_COPY.trust).toBe(
      `Keep me signed in on this device for ${SIGN_IN.trustedSessionDays} days`,
    )
    expect(VERIFY_COPY.wrongCode(3)).toBe("That code doesn't match. You have 3 tries left.")
    expect(VERIFY_COPY.wrongCode(1)).toBe("That code doesn't match. You have 1 try left.")
    expect(VERIFY_COPY.expired).toBe('That code has run out. Send a new code.')
    expect(VERIFY_COPY.tooManyTries).toBe(
      'That code had five wrong tries and no longer works. Send a new code.',
    )
    expect(ACCOUNT_COPY.decline).toBe('No, thanks')
    expect(ACCOUNT_COPY.under18).toBe(
      'My IIIC accounts are for adults. A parent or guardian can book and sign in for their child.',
    )
    expect(LOGIN_COPY.tooMany(NOW)).toMatch(
      /^We've sent several codes to this address\. Use the latest, or ask again after /,
    )
  })

  it('have no exclamation mark, no price, no clinical word and no urgency', () => {
    expect(`${all} ${said}`).not.toMatch(
      /!|₹|\bRs\.?\s?\d|therap|clinic|diagnos|treatment|hurry|last chance/i,
    )
  })

  it('say nothing about whether an address has an account before its code', () => {
    expect(`${LOGIN_COPY.lead} ${VERIFY_COPY.sent('x')}`).not.toMatch(
      /account (exists|found)|no account|not registered/i,
    )
  })
})
