// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The one request a customer's server code runs on (docs/20 §8; D-133): no Payload user, of the
// browser's headers only the network address and the browser, never its cookies, and the
// signed-in account on the request's context, so the audit log names `account:<id>` as the actor
// of every write made on it. Obviously fake addresses only.

vi.mock('server-only', () => ({}))
vi.mock('@payload-config', () => ({ default: {} }))

const SENT = {
  cookie: 'iiic-account.session_token=fake-session-token; iiic-sign-in=fake-sealed-attempt',
  authorization: 'Bearer fake-token',
  'x-forwarded-for': '203.0.113.21, 10.0.0.1',
  'x-real-ip': '203.0.113.21',
  'user-agent': 'Fake browser 1.0',
  'accept-language': 'en-IN',
  referer: 'https://fake.example.invalid/account/privacy',
}
vi.mock('next/headers', () => ({ headers: async () => new Headers(SENT) }))

const fakePayload = { fake: 'payload' }
const createLocalReq = vi.fn(
  async (options: { req?: Record<string, unknown>; context?: Record<string, unknown> }) => ({
    ...options.req,
    context: options.context ?? {},
    user: null,
    payload: fakePayload,
  }),
)
vi.mock('payload', async (original) => ({
  ...(await original<typeof import('payload')>()),
  getPayload: async () => fakePayload,
  createLocalReq: (options: never) => createLocalReq(options),
}))

const { accountRequest, KEPT_HEADERS } = await import('@/lib/accounts/scope')
const { contextActor, setAuditActor } = await import('@/lib/audit/actor')

beforeEach(() => {
  createLocalReq.mockClear()
})

describe('accountRequest', () => {
  it('keeps the network address and the browser, and none of the cookies (D-133)', async () => {
    const req = await accountRequest({ accountId: 10 })
    const kept = Object.fromEntries(req.headers.entries())
    expect(kept).toEqual({
      'x-forwarded-for': SENT['x-forwarded-for'],
      'x-real-ip': SENT['x-real-ip'],
      'user-agent': SENT['user-agent'],
    })
    expect([...KEPT_HEADERS]).toEqual(['x-forwarded-for', 'x-real-ip', 'user-agent'])
    expect(JSON.stringify(createLocalReq.mock.calls)).not.toContain('fake-session-token')
    expect(req.user).toBeNull()
  })

  it('names the signed-in account as the actor of what it writes', async () => {
    const req = await accountRequest({ accountId: 10 })
    expect(req.context.auditActor).toEqual({ id: 'account:10' })
    expect(contextActor(req)).toEqual({ id: 'account:10' })
  })

  it('names no one before the sign-in steps know the account, which they name then', async () => {
    const req = await accountRequest()
    expect(req.context.auditActor).toBeUndefined()
    expect(contextActor(req)).toBeUndefined()
    setAuditActor(req, { id: 'account:42' })
    expect(contextActor(req)).toEqual({ id: 'account:42' })
  })
})

describe('the actor a request’s context names', () => {
  it('is an account and nothing else', () => {
    const of = (auditActor: unknown) => contextActor({ context: { auditActor } as never })
    expect(of({ id: 'account:7' })).toEqual({ id: 'account:7' })
    for (const forged of [
      { id: 'account:' },
      { id: 'account:7x' },
      { id: 'owner:1' },
      { id: 7 },
      'account:7',
      null,
      undefined,
    ]) {
      expect(of(forged), JSON.stringify(forged)).toBeUndefined()
    }
    expect(contextActor({ context: undefined as never })).toBeUndefined()
  })
})
