import { expect, test } from '@playwright/test'

// The security headers on every route group (docs/12 §5, §14; D-42). Only Vercel's production
// deployment may be indexed: set E2E_INDEXABLE=true when PLAYWRIGHT_BASE_URL points at it.
const INDEXABLE = process.env.E2E_INDEXABLE === 'true'
// Locally the tests run against `next dev`, whose CSP also allows eval for React's debugging.
const DEV_SERVER = !process.env.CI && !process.env.PLAYWRIGHT_BASE_URL

const STATIC_HEADERS = {
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'cross-origin-opener-policy': 'same-origin',
  'x-frame-options': 'DENY',
}

const ROUTE_GROUPS = [
  { name: 'a public page', path: '/', html: true, private: false },
  { name: 'the 404 page', path: '/no-such-page', html: true, private: false },
  // No public/ folder: a path that looks like a file renders the 404 page, with the CSP.
  { name: 'a file-like path', path: '/favicon.ico', html: true, private: false },
  { name: 'the admin', path: '/admin/login', html: true, private: true },
  { name: 'the API', path: '/api/health', html: false, private: true },
]

const nonceOf = (csp: string | undefined) => csp?.match(/'nonce-([^']+)'/)?.[1]

function expectStrictCsp(csp: string | undefined) {
  expect(csp).toMatch(
    DEV_SERVER
      ? /(^|; )script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/
      : /(^|; )script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'(;|$)/,
  )
  for (const directive of [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]) {
    expect(csp).toContain(directive)
  }
  if (!DEV_SERVER) expect(csp).not.toContain("'unsafe-eval'")
}

for (const group of ROUTE_GROUPS) {
  test(`${group.name} sends the security headers`, async ({ request }) => {
    const headers = (await request.get(group.path)).headers()
    for (const [name, value] of Object.entries(STATIC_HEADERS)) {
      expect(headers[name], name).toBe(value)
    }
    // Payload's colour-scheme hints are dropped (src/lib/security/headers.ts).
    expect(headers['critical-ch']).toBeUndefined()
    expect(headers['accept-ch']).toBeUndefined()
    expect(headers['x-powered-by']).toBeUndefined()
    if (group.private || !INDEXABLE) expect(headers['x-robots-tag']).toBe('noindex')
    else expect(headers['x-robots-tag']).toBeUndefined()
    if (group.html) expectStrictCsp(headers['content-security-policy'])
  })
}

test('a prefetch header does not get a page past the proxy', async ({ request }) => {
  const prefetchHeaders: Record<string, string>[] = [
    { Purpose: 'prefetch' },
    { 'Next-Router-Prefetch': '1' },
  ]
  for (const headers of prefetchHeaders) {
    const response = await request.get('/', { headers })
    expectStrictCsp(response.headers()['content-security-policy'])
  }
})

test('every script the server renders carries the nonce, and the nonce changes per response', async ({
  request,
}) => {
  const first = await request.get('/')
  const nonce = nonceOf(first.headers()['content-security-policy'])
  expect(nonce).toBeTruthy()
  const scripts = (await first.text()).match(/<script\b[^>]*>/g) ?? []
  expect(scripts.length).toBeGreaterThan(0)
  for (const script of scripts) expect(script, script).toContain(`nonce="${nonce}"`)

  const second = await request.get('/')
  expect(nonceOf(second.headers()['content-security-policy'])).not.toBe(nonce)
})

test("Next.js's prerendered error pages are never served without the nonce", async ({
  request,
}) => {
  for (const path of [
    '/_not-found',
    '/_global-error',
    '/404',
    '/500',
    '/%5Fnot-found',
    '/_app',
    '/_error',
  ]) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(404)
    const nonce = nonceOf(response.headers()['content-security-policy'])
    expect(nonce, path).toBeTruthy()
    for (const script of (await response.text()).match(/<script\b[^>]*>/g) ?? []) {
      expect(script, `${path}: ${script}`).toContain(`nonce="${nonce}"`)
    }
  }
})

test('a missing build asset gets a policy that lets nothing run', async ({ request }) => {
  const response = await request.get('/_next/static/chunks/missing.js')
  expect(response.headers()['content-security-policy']).toBe(
    "default-src 'none'; frame-ancestors 'none'",
  )
})

test('public pages run under the policy without a violation', async ({ page }) => {
  const violations: string[] = []
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) violations.push(message.text())
  })
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(
        `Content Security Policy violation: ${event.effectiveDirective} ${event.blockedURI}`,
      )
    })
  })
  for (const path of ['/', '/no-such-page', '/admin/login']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
  }
  expect(violations).toEqual([])
})
