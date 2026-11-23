// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  fakeTurnstile,
  isTokenShaped,
  siteverify,
  TURNSTILE_ORIGIN,
  turnstileKeys,
  turnstileSources,
} from '@/lib/enquiryForms/turnstile'
import { buildCsp } from '@/lib/security/csp'

// Cloudflare Turnstile on the public forms, only where both its keys are set (docs/17 §6).
// Obviously fake keys and tokens; no request leaves for Cloudflare.
const KEYS = { TURNSTILE_SITE_KEY: 'fake-site-key', TURNSTILE_SECRET_KEY: 'fake-secret-key' }

const directives = (csp: string) =>
  new Map(
    csp.split('; ').map((directive) => {
      const [name, ...values] = directive.split(' ')
      return [name, values] as const
    }),
  )

describe('Turnstile’s keys', () => {
  it('turn it on only together', () => {
    expect(turnstileKeys(KEYS)).toEqual({ siteKey: 'fake-site-key', secretKey: 'fake-secret-key' })
    expect(turnstileKeys({ TURNSTILE_SITE_KEY: 'fake-site-key' })).toBeNull()
    expect(turnstileKeys({ TURNSTILE_SECRET_KEY: 'fake-secret-key' })).toBeNull()
    expect(turnstileKeys({})).toBeNull()
  })
})

describe('the page’s policy for Turnstile', () => {
  it('lets its script and its frame in on public pages, only where it is on', () => {
    expect(turnstileSources('/organisations/team-map', true)).toEqual({
      scriptOrigins: [TURNSTILE_ORIGIN],
      frameOrigins: [TURNSTILE_ORIGIN],
    })
    expect(turnstileSources('/organisations/team-map', false)).toEqual({
      scriptOrigins: [],
      frameOrigins: [],
    })
    expect(turnstileSources('/admin/collections/enquiries', true)).toEqual({
      scriptOrigins: [],
      frameOrigins: [],
    })
  })

  it('frames Turnstile alone, without the "none" it replaces', () => {
    const csp = directives(
      buildCsp({ nonce: 'n', development: false, https: true, frameOrigins: [TURNSTILE_ORIGIN] }),
    )
    expect(csp.get('frame-src')).toEqual([TURNSTILE_ORIGIN])
    const admin = directives(
      buildCsp({
        nonce: 'n',
        development: false,
        https: true,
        frameSources: "'self'",
        frameOrigins: [TURNSTILE_ORIGIN],
      }),
    )
    expect(admin.get('frame-src')).toEqual(["'self'", TURNSTILE_ORIGIN])
    expect(
      directives(buildCsp({ nonce: 'n', development: false, https: true })).get('frame-src'),
    ).toEqual(["'none'"])
  })
})

describe('the check on the server', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const answering = (status: number, body: unknown) =>
    vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
    )

  it('asks Cloudflare with the secret, the token and the person’s address', async () => {
    const fetchImpl = answering(200, { success: true })
    const check = siteverify('fake-secret-key', fetchImpl as unknown as typeof fetch)
    expect(await check('fake-token', '203.0.113.7')).toBe(true)
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(String(url)).toBe(`${TURNSTILE_ORIGIN}/turnstile/v0/siteverify`)
    expect(init?.method).toBe('POST')
    const body = init?.body as URLSearchParams
    expect(body.get('secret')).toBe('fake-secret-key')
    expect(body.get('response')).toBe('fake-token')
    expect(body.get('remoteip')).toBe('203.0.113.7')
  })

  it('counts a refusal, an error, an odd answer or no answer as not passed', async () => {
    const cases = [
      answering(200, { success: false }),
      answering(500, { success: true }),
      answering(200, 'not json'),
      answering(200, { passed: true }),
      vi.fn(async () => {
        throw new Error('fake network fault')
      }),
    ]
    for (const fetchImpl of cases) {
      const check = siteverify('fake-secret-key', fetchImpl as unknown as typeof fetch)
      expect(await check('fake-token', null)).toBe(false)
    }
  })

  it('takes a token only in the shape the widget gives one', () => {
    expect(isTokenShaped('fake-token')).toBe(true)
    expect(isTokenShaped('')).toBe(false)
    expect(isTokenShaped('x'.repeat(2049))).toBe(false)
    expect(isTokenShaped(undefined)).toBe(false)
  })

  it('has a fake for the forms’ tests, which passes the tokens it is given', async () => {
    const check = fakeTurnstile(['fake-good-token'])
    expect(await check('fake-good-token', null)).toBe(true)
    expect(await check('fake-bad-token', null)).toBe(false)
    expect(check.calls).toEqual(['fake-good-token', 'fake-bad-token'])
  })
})
