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
    TURNSTILE_SITE_KEY: undefined as string | undefined,
    TURNSTILE_SECRET_KEY: undefined as string | undefined,
  },
}))
// The database's count of signups waiting for confirmation, and Cloudflare's check (faked).
const database = vi.hoisted(() => ({ pending: 0 }))
const cloudflare = vi.hoisted(() => ({ passing: ['fake-passing-token'], calls: [] as string[] }))

vi.mock('server-only', () => ({}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@/lib/env', () => ({ env: () => settings.current }))
vi.mock('@/lib/monitoring/sentry', () => ({ reportError: vi.fn(async () => {}) }))
vi.mock('payload', async (original) => ({
  ...(await original<typeof import('payload')>()),
  getPayload: vi.fn(async () => ({
    fake: true,
    count: vi.fn(async () => ({ totalDocs: database.pending })),
  })),
  createLocalReq: vi.fn(async (options: Record<string, unknown>) => ({ ...options, user: null })),
}))
vi.mock('@/lib/enquiryForms/turnstile', async (original) => ({
  ...(await original<typeof import('@/lib/enquiryForms/turnstile')>()),
  siteverify: () => async (token: string) => {
    cloudflare.calls.push(token)
    return cloudflare.passing.includes(token)
  },
}))
vi.mock('@/lib/newsletter/withdrawals', () => ({
  withdrawPurpose: vi.fn(async () => ({ withdrawn: 1 })),
}))
vi.mock('@/lib/newsletter/subscriptions', () => ({
  unsubscribe: vi.fn(async () => ({ ok: true, value: {} })),
  signUp: vi.fn(async () => ({ ok: true, value: {} })),
  confirmSignup: vi.fn(async () => ({ ok: true, value: { already: false } })),
}))

const { createLocalReq, getPayload } = await import('payload')
const { signLink, verifyLink } = await import('@/lib/messaging/links')
// Not a React hook, whatever its name says: the core's port takes a stand-in for the tests.
const { useMessagingCore: registerCore } = await import('@/lib/automations/operations/core')
const { withdrawPurpose } = await import('@/lib/newsletter/withdrawals')
const { confirmSignup, signUp, unsubscribe } = await import('@/lib/newsletter/subscriptions')
const withdrawRoute = await import('@/app/(platform)/w/[token]/withdraw/route')
const unsubscribeRoute = await import('@/app/api/newsletter/unsubscribe/route')
const signupRoute = await import('@/app/api/newsletter/route')
const confirmRoute = await import('@/app/api/newsletter/confirm/route')
const { RECENT_SIGNUPS } = await import('@/lib/newsletter/signupGuard')

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

// The routes verify links through the core's port; the real verifier, without loading the rest of
// the core (which a busy run takes long to import), so no test outlives its time.
registerCore({
  deliver: async () => {
    throw new Error('nothing is sent here')
  },
  cancelQueued: async () => 0,
  verifyLink,
})
vi.setConfig({ testTimeout: 30_000 })

beforeEach(() => {
  vi.clearAllMocks()
  settings.current.VERCEL_ENV = undefined
  settings.current.TURNSTILE_SITE_KEY = undefined
  settings.current.TURNSTILE_SECRET_KEY = undefined
  database.pending = 0
  cloudflare.calls = []
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

  it('sends the account consent to My IIIC, where closing the account ends it (D-113)', async () => {
    const token = await signLink({ purpose: 'withdraw', subjectId: 42, expiresInDays: 1 })
    const answer = await withdrawRoute.POST(
      form(`${SITE}/w/${token}/withdraw`, { purpose: 'account' }),
      { params: Promise.resolve({ token }) },
    )
    expect(answer.status).toBe(303)
    expect(answer.headers.get('location')).toBe(`${SITE}/account/privacy`)
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

  it('unsubscribes from a multipart one-click body as from a URL-encoded one (RFC 8058)', async () => {
    const token = await signLink({ purpose: 'unsubscribe', subjectId: 9, expiresInDays: 1 })
    const body = new FormData()
    body.set('List-Unsubscribe', 'One-Click')
    const multipart = new Request(
      `${SITE}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`,
      { method: 'POST', body },
    )
    expect(multipart.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/)
    const answer = await unsubscribeRoute.POST(multipart)
    expect(answer.status).toBe(200)
    expect(unsubscribe).toHaveBeenCalledWith(
      expect.objectContaining({ user: null }),
      9,
      'email',
      expect.any(Date),
    )
  })

  it('reads the visible page’s form sent as multipart too', async () => {
    const token = await signLink({ purpose: 'unsubscribe', subjectId: 9, expiresInDays: 1 })
    const body = new FormData()
    body.set('token', token)
    const answer = await unsubscribeRoute.POST(
      new Request(`${SITE}/api/newsletter/unsubscribe`, { method: 'POST', body }),
    )
    expect(answer.headers.get('location')).toBe(`${SITE}/newsletter?state=unsubscribed`)
    expect(unsubscribe).toHaveBeenCalledWith(expect.anything(), 9, 'web', expect.any(Date))
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

describe('the links from a message on a preview, which shares production’s database (D-102)', () => {
  it('withdraw, unsubscribe and confirm nothing, look nothing up, and read as a link that does not work', async () => {
    settings.current.VERCEL_ENV = 'preview'
    const withdrawToken = await signLink({ purpose: 'withdraw', subjectId: 42, expiresInDays: 1 })
    const withdrawn = await withdrawRoute.POST(
      form(`${SITE}/w/${withdrawToken}/withdraw`, { purpose: 'marketingEmail' }),
      { params: Promise.resolve({ token: withdrawToken }) },
    )
    expect(withdrawn.headers.get('location')).toBe(`${SITE}/newsletter?state=invalid-link`)

    const unsubscribeToken = await signLink({
      purpose: 'unsubscribe',
      subjectId: 9,
      expiresInDays: 1,
    })
    const oneClick = await unsubscribeRoute.POST(
      form(`${SITE}/api/newsletter/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`, {
        'List-Unsubscribe': 'One-Click',
      }),
    )
    expect(oneClick.status).toBe(400)
    const fromPage = await unsubscribeRoute.POST(
      form(`${SITE}/api/newsletter/unsubscribe`, { token: unsubscribeToken }),
    )
    expect(fromPage.headers.get('location')).toBe(`${SITE}/newsletter?state=invalid-link`)

    const confirmed = await confirmRoute.POST(
      form(`${SITE}/api/newsletter/confirm`, { token: 'A'.repeat(43) }),
    )
    expect(confirmed.headers.get('location')).toBe(`${SITE}/newsletter?state=invalid-link`)

    expect(withdrawPurpose).not.toHaveBeenCalled()
    expect(unsubscribe).not.toHaveBeenCalled()
    expect(confirmSignup).not.toHaveBeenCalled()
    expect(getPayload).not.toHaveBeenCalled()
  })

  it('act locally and on production', async () => {
    for (const vercelEnv of [undefined, 'production']) {
      settings.current.VERCEL_ENV = vercelEnv
      const token = await signLink({ purpose: 'withdraw', subjectId: 42, expiresInDays: 1 })
      const answer = await withdrawRoute.POST(
        form(`${SITE}/w/${token}/withdraw`, { purpose: 'marketingEmail' }),
        { params: Promise.resolve({ token }) },
      )
      expect(answer.headers.get('location')).toBe(`${SITE}/w/${token}?state=done`)
    }
    expect(withdrawPurpose).toHaveBeenCalledTimes(2)
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

  it('checks Turnstile where its keys are set, before anything is looked up', async () => {
    settings.current.TURNSTILE_SITE_KEY = 'fake-site-key'
    settings.current.TURNSTILE_SECRET_KEY = 'fake-secret-key'
    const without = await signupRoute.POST(signup())
    expect(without.status).toBe(400)
    expect(await without.json()).toEqual({ state: 'check-failed' })
    const failing = await signupRoute.POST(
      form(
        `${SITE}/api/newsletter`,
        { email: 'fake@example.invalid', 'cf-turnstile-response': 'fake-failing-token' },
        { accept: 'application/json' },
      ),
    )
    expect(failing.status).toBe(400)
    expect(signUp).not.toHaveBeenCalled()
    expect(getPayload).not.toHaveBeenCalled()
    const passing = await signupRoute.POST(
      form(
        `${SITE}/api/newsletter`,
        { email: 'fake@example.invalid', 'cf-turnstile-response': 'fake-passing-token' },
        { accept: 'application/json' },
      ),
    )
    expect(passing.status).toBe(202)
    expect(cloudflare.calls).toEqual(['fake-failing-token', 'fake-passing-token'])
    expect(signUp).toHaveBeenCalledTimes(1)
  })

  it('is busy for everyone once the database holds as many recent pending signups as allowed', async () => {
    database.pending = RECENT_SIGNUPS.max
    const answer = await signupRoute.POST(signup())
    expect(answer.status).toBe(429)
    expect(await answer.json()).toEqual({ state: 'busy' })
    expect(signUp).not.toHaveBeenCalled()
    database.pending = RECENT_SIGNUPS.max - 1
    expect((await signupRoute.POST(signup())).status).toBe(202)
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
