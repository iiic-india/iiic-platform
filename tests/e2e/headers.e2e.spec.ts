import { expect, test } from '@playwright/test'

// The security headers on every route group (docs/12 §5, §14; D-42). Only Vercel's production
// deployment may be indexed: set E2E_INDEXABLE=true when PLAYWRIGHT_BASE_URL points at it.
const INDEXABLE = process.env.E2E_INDEXABLE === 'true'

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
  { name: 'the admin', path: '/admin/login', html: true, private: true },
  { name: 'the API', path: '/api/health', html: false, private: true },
]

const nonceOf = (csp: string | undefined) => csp?.match(/'nonce-([^']+)'/)?.[1]

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

    if (!group.html) return
    const csp = headers['content-security-policy']
    expect(csp).toMatch(/(^|; )script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'(;|$)/)
    for (const directive of [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ]) {
      expect(csp).toContain(directive)
    }
    expect(csp).not.toContain("'unsafe-eval'")
  })
}

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
