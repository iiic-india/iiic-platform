// @vitest-environment node
import { createHash } from 'node:crypto'

import { SignJWT } from 'jose'
import { NextRequest } from 'next/server'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

type Proxy = typeof import('@/proxy').proxy
let proxy: Proxy

// Obviously fake values, set before the proxy reads its environment.
const SECRET = 'test-only-payload-secret-00000000000000'

beforeAll(async () => {
  process.env.PAYLOAD_SECRET = SECRET
  process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/iiic_test'
  process.env.INSTITUTE_HOSTS = 'iiic.edu.in'
  process.env.R2_ACCOUNT_ID = 'test-only-account'
  process.env.R2_ACCESS_KEY_ID = 'test-only-key-id'
  process.env.R2_SECRET_ACCESS_KEY = 'test-only-secret'
  process.env.R2_PUBLIC_BASE_URL = 'https://media.example/'
  ;({ proxy } = await import('@/proxy'))
})

afterEach(() => {
  delete process.env.NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN
})

const nonceOf = (csp: string | null) => csp?.match(/'nonce-([^']+)'/)?.[1]
/** Next.js forwards a request header set by the proxy as x-middleware-request-<name>. */
const forwarded = (response: Response, name: string) =>
  response.headers.get(`x-middleware-request-${name}`)

const run = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  proxy(new NextRequest(url, init))

const cspOf = async (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  (await run(url, init)).headers.get('content-security-policy') ?? ''

/**
 * A two-factor cookie as payload-totp writes it: a token signed with Payload's own key, the
 * SHA-256 of PAYLOAD_SECRET in hex, cut to 32 characters (`payload.secret`).
 */
async function twoFactorToken(secret = SECRET, expiresIn = '2h'): Promise<string> {
  const key = createHash('sha256').update(secret).digest('hex').slice(0, 32)
  return new SignJWT({ originalStrategy: 'local-jwt', userId: 1 })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(key))
}

const cookieHeader = (cookies: Record<string, string>) => ({
  headers: {
    cookie: Object.entries(cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; '),
  },
})

describe('proxy', () => {
  it('sends a CSP with a nonce, and hands the same policy to the renderer', async () => {
    const response = await run('https://iiic.example/')
    const csp = response.headers.get('content-security-policy')
    expect(nonceOf(csp)).toBeTruthy()
    expect(forwarded(response, 'content-security-policy')).toBe(csp)
  })

  it('uses a new nonce for every request', async () => {
    const nonces = await Promise.all(
      Array.from({ length: 5 }, async () => nonceOf(await cspOf('https://iiic.example/'))),
    )
    expect(new Set(nonces).size).toBe(5)
  })

  it('lets images come from the media bucket', async () => {
    expect(await cspOf('https://iiic.example/')).toContain(
      "img-src 'self' data: blob: https://media.example;",
    )
  })

  it('upgrades insecure requests only over https', async () => {
    expect(await cspOf('https://iiic.example/')).toContain('upgrade-insecure-requests')
    expect(await cspOf('http://localhost:3000/')).not.toContain('upgrade-insecure-requests')
  })

  it('sets x-pathname itself, whatever the client sent', async () => {
    const response = await run('https://iiic.example/admin/collections/users', {
      headers: { 'x-pathname': '/admin/verify-totp' },
    })
    expect(forwarded(response, 'x-pathname')).toBe('/admin/collections/users')
  })

  it('serves an institute host from /institute, keeping the query', async () => {
    const response = await run('https://iiic.edu.in/verify?id=IIIC-C-2026-1')
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://iiic.edu.in/institute/verify?id=IIIC-C-2026-1',
    )
    expect(response.headers.get('content-security-policy')).toBeTruthy()
  })

  it('does not rewrite the platform host', async () => {
    const response = await run('https://iiic.example/verify')
    expect(response.headers.get('x-middleware-rewrite')).toBeNull()
  })

  it("serves the site's 404 instead of Next.js's prerendered error pages", async () => {
    for (const path of [
      '/_not-found',
      '/_global-error',
      '/404',
      '/500',
      '/%5Fnot-found',
      '/_not%2Dfound',
      '/_app',
      '/_document',
      '/_error',
    ]) {
      const response = await run(`https://iiic.example${path}`)
      expect(response.headers.get('x-middleware-rewrite'), path).toBe(
        'https://iiic.example/page-not-found',
      )
    }
  })
})

describe('proxy: framing (docs/12 §5; OS-4)', () => {
  it('lets nothing frame a page, and a page frame nothing', async () => {
    const response = await run('https://iiic.example/framework')
    const csp = response.headers.get('content-security-policy')
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("frame-src 'none'")
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('x-robots-tag')).toBeNull()
  })

  it('lets the admin frame this origin, for its live preview, and nothing frame the admin', async () => {
    for (const path of ['/admin', '/admin/collections/pages/1', '/ADMIN/login']) {
      const response = await run(`https://iiic.example${path}`)
      const csp = response.headers.get('content-security-policy')
      expect(csp, path).toContain("frame-src 'self'")
      expect(csp, path).toContain("frame-ancestors 'none'")
      expect(response.headers.get('x-frame-options'), path).toBe('DENY')
    }
    // A path that only starts with the same letters is a page like any other.
    expect(await cspOf('https://iiic.example/administration')).toContain("frame-src 'none'")
  })

  it('lets the admin frame a draft-mode page for staff who entered their code, unindexed', async () => {
    const response = await run(
      'https://iiic.example/framework',
      cookieHeader({
        __prerender_bypass: 'fake-draft-mode-id',
        'payload-token': 'fake-session',
        'payload-totp': await twoFactorToken(),
      }),
    )
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'self'")
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
  })

  it('keeps DENY without draft mode, without a session, or without a verified two-factor cookie', async () => {
    const valid = await twoFactorToken()
    const cases: Record<string, Record<string, string>> = {
      'no cookies': {},
      'draft mode alone (a visitor)': { __prerender_bypass: 'fake-draft-mode-id' },
      'draft mode and a session, no code': {
        __prerender_bypass: 'fake-draft-mode-id',
        'payload-token': 'fake-session',
      },
      'a session with its code, no draft mode': {
        'payload-token': 'fake-session',
        'payload-totp': valid,
      },
      'a code signed with another secret': {
        __prerender_bypass: 'fake-draft-mode-id',
        'payload-token': 'fake-session',
        'payload-totp': await twoFactorToken('another-test-only-secret-000000000000000'),
      },
      'an expired code': {
        __prerender_bypass: 'fake-draft-mode-id',
        'payload-token': 'fake-session',
        'payload-totp': await twoFactorToken(SECRET, '-1m'),
      },
      'a code that is not a token': {
        __prerender_bypass: 'fake-draft-mode-id',
        'payload-token': 'fake-session',
        'payload-totp': 'not-a-token',
      },
    }
    for (const [name, cookies] of Object.entries(cases)) {
      const response = await run('https://iiic.example/framework', cookieHeader(cookies))
      expect(response.headers.get('content-security-policy'), name).toContain(
        "frame-ancestors 'none'",
      )
      expect(response.headers.get('x-frame-options'), name).toBe('DENY')
    }
  })

  it('never lets the admin itself be framed, whatever the cookies', async () => {
    const response = await run(
      'https://iiic.example/admin',
      cookieHeader({
        __prerender_bypass: 'fake-draft-mode-id',
        'payload-token': 'fake-session',
        'payload-totp': await twoFactorToken(),
      }),
    )
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(response.headers.get('x-frame-options')).toBe('DENY')
  })
})

describe('proxy: Cloudflare’s beacon (docs/12 §5, §7)', () => {
  it('names no third-party origin while the token is unset (CI, local)', async () => {
    const csp = await cspOf('https://iiic.example/')
    expect(csp).not.toContain('cloudflareinsights.com')
    expect(csp).toContain("connect-src 'self';")
  })

  it('names the beacon’s two origins on public pages once the token is set', async () => {
    process.env.NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN = '0123456789abcdef0123456789abcdef'
    const csp = await cspOf('https://iiic.example/')
    expect(csp).toMatch(
      /script-src 'self' 'nonce-[^']+' 'strict-dynamic' https:\/\/static\.cloudflareinsights\.com;/,
    )
    expect(csp).toContain("connect-src 'self' https://cloudflareinsights.com;")
  })

  it('never names them in the admin', async () => {
    process.env.NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN = '0123456789abcdef0123456789abcdef'
    expect(await cspOf('https://iiic.example/admin/login')).not.toContain('cloudflareinsights')
  })
})

describe('proxy matcher', () => {
  it('covers every path but the API and Next.js build assets, whatever the headers', async () => {
    const { config } = await import('@/proxy')
    expect(config.matcher).toEqual(['/((?!api/|_next/static/|_next/image).*)'])
    const pattern = new RegExp(`^${config.matcher[0]}$`)
    for (const path of ['/', '/favicon.ico', '/robots.txt', '/x.png', '/admin', '/admin/x.svg']) {
      expect(pattern.test(path), path).toBe(true)
    }
    for (const path of ['/api/health', '/_next/static/chunks/a.js', '/_next/image']) {
      expect(pattern.test(path), path).toBe(false)
    }
  })
})
