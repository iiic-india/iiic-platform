// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Previews and the flag (docs/20 §4.9, §11; D-122): on a preview, which shares production's
// database, every sign-in action answers `closed-here` before it reads its input, the request or
// the database, and `getAccountSession` is null without touching anything; while
// `accountsEnabled` is off, `/login` is a 404. Without Better Auth's secret, sign-in is closed.

vi.mock('server-only', () => ({}))
vi.mock('@payload-config', () => ({ default: {} }))

const settings = {
  VERCEL_ENV: 'preview' as 'preview' | 'production' | undefined,
  BETTER_AUTH_SECRET: 'unit-only-better-auth-secret-0000000000000000' as string | undefined,
  siteUrl: 'https://fake.example.invalid',
  allowedOrigins: ['https://fake.example.invalid'],
  MESSAGING_TRANSPORT: 'live' as const,
}
vi.mock('@/lib/env', () => ({ env: () => settings }))

const getPayload = vi.fn(async () => {
  throw new Error('read the database')
})
vi.mock('payload', async (original) => ({
  ...(await original<typeof import('payload')>()),
  getPayload: () => getPayload(),
}))
vi.mock('next/headers', () => ({
  headers: async () => {
    throw new Error('read the request')
  },
  cookies: async () => {
    throw new Error('read the cookies')
  },
}))

const flags = { accountsEnabled: false }
const readFlags = vi.fn(async () => flags)
vi.mock('@/lib/settings/source', async (original) => ({
  ...(await original<typeof import('@/lib/settings/source')>()),
  readFlags: () => readFlags(),
}))

const steps = await import('@/lib/accounts/signIn/steps')
const details = await import('@/lib/accounts/details')
const { getAccountSession } = await import('@/lib/accounts/session')
const { default: LoginPage } = await import('@/app/(platform)/(default)/login/page')

/** Anything that reads it fails the test: a preview reads nothing. */
const untouchable = <T>(what: string) =>
  new Proxy(
    {},
    {
      get(_target, key) {
        throw new Error(`${what} read: ${String(key)}`)
      },
    },
  ) as T

const req = untouchable<never>('the request')
const input = untouchable<never>('the input')
const account = untouchable<never>('the account')
const NOW = new Date('2099-03-04T11:00:00+05:30')
const wiring = {
  settings: () => settings,
  deps: async () => {
    throw new Error('built the dependencies')
  },
}

beforeEach(() => {
  settings.VERCEL_ENV = 'preview'
  settings.BETTER_AUTH_SECRET = 'unit-only-better-auth-secret-0000000000000000'
  flags.accountsEnabled = false
  readFlags.mockClear()
  getPayload.mockClear()
})

describe('on a preview', () => {
  it('every sign-in action answers closed-here before reading its input or the database', async () => {
    const answers = await Promise.all([
      steps.requestCodeWith(wiring)(req, input, NOW),
      steps.resendCodeWith(wiring)(req, NOW),
      steps.verifyCodeWith(wiring)(req, input, NOW),
      steps.createAccountWith(wiring)(req, input, NOW),
      details.requestDetailCodeWith(wiring)(req, account, input, NOW),
      details.confirmDetailWith(wiring)(req, account, input, NOW),
    ])
    for (const answer of answers)
      expect(answer).toEqual({ ok: false, error: { code: 'closed-here' } })
    expect(readFlags).not.toHaveBeenCalled()
  })

  it('reads no session, and touches neither the database nor the request', async () => {
    expect(await getAccountSession()).toBeNull()
    expect(getPayload).not.toHaveBeenCalled()
    expect(readFlags).not.toHaveBeenCalled()
  })
})

describe('without Better Auth’s secret', () => {
  it('closes sign-in the same way, wherever it runs', async () => {
    settings.VERCEL_ENV = 'production'
    settings.BETTER_AUTH_SECRET = undefined
    expect(await steps.requestCodeWith(wiring)(req, input, NOW)).toEqual({
      ok: false,
      error: { code: 'closed-here' },
    })
    expect(await getAccountSession()).toBeNull()
  })
})

describe('with accountsEnabled off', () => {
  it('answers closed-here once the flag is read, before the input', async () => {
    settings.VERCEL_ENV = undefined
    const quiet = { payload: {} } as never
    expect(await steps.requestCodeWith(wiring)(quiet, input, NOW)).toEqual({
      ok: false,
      error: { code: 'closed-here' },
    })
    expect(readFlags).toHaveBeenCalledTimes(1)
  })

  it('makes /login a 404', async () => {
    settings.VERCEL_ENV = undefined
    getPayload.mockImplementationOnce(async () => ({}) as never)
    const error = await LoginPage({ searchParams: Promise.resolve({}) }).catch((thrown) => thrown)
    expect(String((error as { digest?: string }).digest)).toContain('404')
  })
})
