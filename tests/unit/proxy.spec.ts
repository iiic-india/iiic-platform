// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeAll, describe, expect, it } from 'vitest'

type Proxy = typeof import('@/proxy').proxy
let proxy: Proxy

beforeAll(async () => {
  // Obviously fake values, set before the proxy reads its environment.
  process.env.PAYLOAD_SECRET = 'test-only-payload-secret-00000000000000'
  process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/iiic_test'
  process.env.INSTITUTE_HOSTS = 'iiic.edu.in'
  process.env.R2_ACCOUNT_ID = 'test-only-account'
  process.env.R2_ACCESS_KEY_ID = 'test-only-key-id'
  process.env.R2_SECRET_ACCESS_KEY = 'test-only-secret'
  process.env.R2_PUBLIC_BASE_URL = 'https://media.example/'
  ;({ proxy } = await import('@/proxy'))
})

const nonceOf = (csp: string | null) => csp?.match(/'nonce-([^']+)'/)?.[1]
/** Next.js forwards a request header set by the proxy as x-middleware-request-<name>. */
const forwarded = (response: Response, name: string) =>
  response.headers.get(`x-middleware-request-${name}`)

describe('proxy', () => {
  it('sends a CSP with a nonce, and hands the same policy to the renderer', () => {
    const response = proxy(new NextRequest('https://iiic.example/'))
    const csp = response.headers.get('content-security-policy')
    expect(nonceOf(csp)).toBeTruthy()
    expect(forwarded(response, 'content-security-policy')).toBe(csp)
  })

  it('uses a new nonce for every request', () => {
    const nonces = Array.from({ length: 5 }, () =>
      nonceOf(
        proxy(new NextRequest('https://iiic.example/')).headers.get('content-security-policy'),
      ),
    )
    expect(new Set(nonces).size).toBe(5)
  })

  it('lets images come from the media bucket', () => {
    const csp = proxy(new NextRequest('https://iiic.example/')).headers.get(
      'content-security-policy',
    )
    expect(csp).toContain("img-src 'self' data: blob: https://media.example;")
  })

  it('upgrades insecure requests only over https', () => {
    const secure = proxy(new NextRequest('https://iiic.example/'))
    const plain = proxy(new NextRequest('http://localhost:3000/'))
    expect(secure.headers.get('content-security-policy')).toContain('upgrade-insecure-requests')
    expect(plain.headers.get('content-security-policy')).not.toContain('upgrade-insecure-requests')
  })

  it('sets x-pathname itself, whatever the client sent', () => {
    const response = proxy(
      new NextRequest('https://iiic.example/admin/collections/users', {
        headers: { 'x-pathname': '/admin/verify-totp' },
      }),
    )
    expect(forwarded(response, 'x-pathname')).toBe('/admin/collections/users')
  })

  it('serves an institute host from /institute, keeping the query', () => {
    const response = proxy(new NextRequest('https://iiic.edu.in/verify?id=IIIC-C-2026-1'))
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://iiic.edu.in/institute/verify?id=IIIC-C-2026-1',
    )
    expect(response.headers.get('content-security-policy')).toBeTruthy()
  })

  it('does not rewrite the platform host', () => {
    const response = proxy(new NextRequest('https://iiic.example/verify'))
    expect(response.headers.get('x-middleware-rewrite')).toBeNull()
  })

  it("serves the site's 404 instead of Next.js's prerendered error pages", () => {
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
      const response = proxy(new NextRequest(`https://iiic.example${path}`))
      expect(response.headers.get('x-middleware-rewrite'), path).toBe(
        'https://iiic.example/page-not-found',
      )
    }
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
