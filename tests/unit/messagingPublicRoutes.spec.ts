// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The routes people reach from a message, and the newsletter's signup (docs/19 §8; docs/08 §3),
// with Payload and the ledger faked: an unsubscribe or a withdrawal works from its link alone,
// with no sign-in and no user on the request, and a link that was not signed under this server's
// secret does nothing; a preview, which shares production's database, stores no signup.

const settings = vi.hoisted(() => ({
  current: {
    PAYLOAD_SECRET: 'fake-secret-for-the-public-routes-test-0123456789',
    PAYLOAD_SECRET_PREVIOUS: undefined as string | undefined,
    VERCEL_ENV: undefined as string | undefined,
  },
}))

vi.mock('server-only', () => ({}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@/lib/env', () => ({ env: () => settings.current }))
vi.mock('@/lib/monitoring/sentry', () => ({ reportError: vi.fn(async () => {}) }))
vi.mock('payload', async (original) => ({
  ...(await original<typeof import('payload')>()),
  getPayload: vi.fn(async () => ({ fake: true })),
  createLocalReq: vi.fn(async (options: Record<string, unknown>) => ({ ...options, user: null })),
}))
vi.mock('@/lib/newsletter/withdrawals', () => ({
  withdrawPurpose: vi.fn(async () => ({ withdrawn: 1 })),
}))
vi.mock('@/lib/newsletter/subscriptions', () => ({
  unsubscribe: vi.fn(async () => ({ ok: true, value: {} })),
  signUp: vi.fn(async () => ({ ok: true, value: {} })),
}))

const { createLocalReq } = await import('payload')
const { signLink } = await import('@/lib/messaging/links')
const { withdrawPurpose } = await import('@/lib/newsletter/withdrawals')
const { signUp, unsubscribe } = await import('@/lib/newsletter/subscriptions')
const withdrawRoute = await import('@/app/(platform)/w/[token]/withdraw/route')
const unsubscribeRoute = await import('@/app/api/newsletter/unsubscribe/route')
const signupRoute = await import('@/app/api/newsletter/route')

const SITE = 'https://example.invalid'

function form(url: string, fields: Record<string, string>, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(fields).toString(),
  })
}

/** A token of the right shape signed under a secret this server does not hold. */
async function foreignToken(purpose: 'withdraw' | 'unsubscribe', subjectId: number) {
  const own = settings.current.PAYLOAD_SECRET
  settings.current.PAYLOAD_SECRET = 'another-fake-secret-nobody-here-holds-9876543210'
  const token = await signLink({ purpose, subjectId, expiresInDays: 1 })
  settings.current.PAYLOAD_SECRET = own
  return token
}

beforeEach(() => {
  vi.clearAllMocks()
  settings.current.VERCEL_ENV = undefined
})

describe('the withdraw link (docs/08 §3)', () => {
  it('withdraws from the link alone: no sign-in, no user on the request', async () => {
    const token = await signLink({ purpose: 'withdraw', subjectId: 42, expiresInDays: 1 })
    const answer = await withdrawRoute.POST(
      form(`${SITE}/w/${token}/withdraw`, { purpose: 'marketingEmail' }),
      { params: Promise.resolve({ token }) },
    )
    expect(answer.status).toBe(303)
    expect(answer.headers.get('location')).toBe(`${SITE}/w/${token}?state=done`)
    expect(createLocalReq).toHaveBeenCalledWith({}, expect.anything())
    expect(withdrawPurpose).toHaveBeenCalledWith(
      expect.objectContaining({ user: null }),
      expect.objectContaining({ personId: 42, purpose: 'marketingEmail', channel: 'web' }),
      expect.any(Date),
    )
  })

  it('does nothing for a guessed, a foreign or another purpose’s token', async () => {
    const guessed = 'eyJhbGciOiJIUzI1NiJ9.eyJwIjoid2l0aGRyYXciLCJzIjo0Mn0.AAAAAAAAAAAAAAAAAAAA'
    const foreign = await foreignToken('withdraw', 42)
    const unsubscribeOnly = await signLink({
      purpose: 'unsubscribe',
      subjectId: 42,
      expiresInDays: 1,
    })
    for (const token of [guessed, foreign, unsubscribeOnly]) {
      const answer = await withdrawRoute.POST(
        form(`${SITE}/w/${token}/withdraw`, { purpose: 'marketingEmail' }),
        { params: Promise.resolve({ token }) },
      )
      expect(answer.headers.get('location')).toContain('state=failed')
    }
    expect(withdrawPurpose).not.toHaveBeenCalled()
  })
})

describe('the one-click unsubscribe (RFC 8058)', () => {
  it('unsubscribes from the link alone, with no user on the request', async () => {
    const token = await signLink({ purpose: 'unsubscribe', subjectId: 9, expiresInDays: 1 })
    const answer = await unsubscribeRoute.POST(
      form(`${SITE}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`, {
        'List-Unsubscribe': 'One-Click',
      }),
    )
    expect(answer.status).toBe(200)
    expect(unsubscribe).toHaveBeenCalledWith(
      expect.objectContaining({ user: null }),
      9,
      'email',
      expect.any(Date),
    )
  })

  it('refuses a token it did not sign, unsubscribing nobody', async () => {
    const foreign = await foreignToken('unsubscribe', 9)
    const withdrawOnly = await signLink({ purpose: 'withdraw', subjectId: 9, expiresInDays: 1 })
    for (const token of [foreign, withdrawOnly]) {
      const answer = await unsubscribeRoute.POST(
        form(`${SITE}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`, {
          'List-Unsubscribe': 'One-Click',
        }),
      )
      expect(answer.status).toBe(400)
    }
    expect(unsubscribe).not.toHaveBeenCalled()
  })
})

describe('the newsletter signup on a deployment that is not production', () => {
  const signup = () =>
    form(
      `${SITE}/api/newsletter`,
      { email: 'fake@example.invalid' },
      { accept: 'application/json' },
    )

  it('stores nothing on a preview, which shares production’s database', async () => {
    settings.current.VERCEL_ENV = 'preview'
    const answer = await signupRoute.POST(signup())
    expect(answer.status).toBe(503)
    expect(await answer.json()).toEqual({ state: 'closed' })
    expect(signUp).not.toHaveBeenCalled()
  })

  it('signs up locally and on production', async () => {
    for (const vercelEnv of [undefined, 'production']) {
      settings.current.VERCEL_ENV = vercelEnv
      const answer = await signupRoute.POST(signup())
      expect(answer.status).toBe(202)
    }
    expect(signUp).toHaveBeenCalledTimes(2)
  })
})
