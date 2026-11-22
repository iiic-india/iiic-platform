import { expect, test } from '@playwright/test'

// The security headers on every route group (docs/12 §5, §14; D-42). Only Vercel's production
// deployment may be indexed, and only once the site has launched (D-50): set E2E_INDEXABLE=true
// when PLAYWRIGHT_BASE_URL points at the launched site.
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

type RouteGroup = { name: string; path: string; html: boolean; private: boolean; status?: number }

const ROUTE_GROUPS: RouteGroup[] = [
  { name: 'a public page', path: '/', html: true, private: false },
  { name: 'the 404 page', path: '/no-such-page', html: true, private: false, status: 404 },
  // No public/ folder: a missing path that looks like a file renders the 404 page, with the CSP.
  { name: 'a file-like path', path: '/no-such-file.png', html: true, private: false, status: 404 },
  // The tab icon is a real file, served by its own route (D-48), and the proxy covers it too.
  { name: 'the tab icon', path: '/favicon.ico', html: true, private: false, status: 200 },
  // What search engines, link previews and AI tools read beside the pages (docs/12 §3), each
  // served by a route of its own, which the proxy covers as well. Before launch they are
  // noindex like every route (D-50).
  { name: 'robots.txt', path: '/robots.txt', html: true, private: false, status: 200 },
  { name: 'the sitemap', path: '/sitemap.xml', html: true, private: false, status: 200 },
  // Public, yet sent with noindex on every deployment, as a private route is: the file stays out
  // of search results, and AI tools still read it (src/app/llms.txt/route.ts).
  { name: 'llms.txt', path: '/llms.txt', html: true, private: true, status: 200 },
  { name: 'humans.txt', path: '/humans.txt', html: true, private: false, status: 200 },
  {
    name: 'security.txt',
    path: '/.well-known/security.txt',
    html: true,
    private: false,
    status: 200,
  },
  {
    name: 'the web manifest',
    path: '/manifest.webmanifest',
    html: true,
    private: false,
    status: 200,
  },
  { name: 'the logo', path: '/logo.png', html: true, private: false, status: 200 },
  { name: 'a share image', path: '/og/home', html: true, private: false, status: 200 },
  // The Journal's feed: public, sent with noindex on every deployment, as llms.txt is.
  { name: 'the Journal feed', path: '/journal/feed.xml', html: true, private: true, status: 200 },
  // The preview link answers a visitor with a 404 (OS-4).
  {
    name: 'a visitor’s preview link',
    path: '/api/preview?collection=pages&slug=framework',
    html: false,
    private: true,
    status: 404,
  },
  { name: 'the admin', path: '/admin/login', html: true, private: true },
  { name: 'the API', path: '/api/health', html: false, private: true },
]

// Routes that are never indexed, launched or not (D-67): where Find your path posts its
// answer, the Map's personal result, the sign-in pages and a certificate's page. None of them
// is built yet but the first, and the header is sent all the same.
const NEVER_INDEXED = [
  '/map/go',
  '/map/result/fake-id',
  '/login',
  '/login/verify',
  '/institute/verify',
  '/institute/verify/fake-token',
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
    const response = await request.get(group.path)
    if (group.status !== undefined) expect(response.status(), group.path).toBe(group.status)
    const headers = response.headers()
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

// Checks that only make requests: once, in the desktop project.
test.describe('The search system’s headers', () => {
  test.skip(
    ({ isMobile }) => isMobile,
    'These checks only make requests: the desktop project runs them',
  )

  test('the routes that are never indexed say so themselves, on every deployment (D-67)', async ({
    request,
  }) => {
    for (const path of NEVER_INDEXED) {
      // The header of the route itself: /map/go answers with a redirect to the question.
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.headers()['x-robots-tag'], path).toBe('noindex')
    }
    // The pages beside them are indexed once the site has launched (D-50).
    for (const path of ['/map', '/institute']) {
      const response = await request.get(path)
      if (INDEXABLE) expect(response.headers()['x-robots-tag'], path).toBeUndefined()
      else expect(response.headers()['x-robots-tag'], path).toBe('noindex')
    }
  })

  test('pages and the files beside them say their language; the API and build assets do not', async ({
    request,
  }) => {
    // docs/12 §3: Content-Language says what <html lang> says.
    for (const path of [
      '/',
      '/about',
      '/organisations',
      '/map',
      '/no-such-page',
      '/admin/login',
      '/llms.txt',
      '/robots.txt',
      '/sitemap.xml',
    ]) {
      const response = await request.get(path)
      expect(response.headers()['content-language'], path).toBe('en-IN')
    }
    for (const path of ['/api/health', '/_next/static/chunks/missing.js']) {
      const response = await request.get(path)
      expect(response.headers()['content-language'], path).toBeUndefined()
    }
  })
})

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
    // The pages router holds the static 500 (src/pages/500.tsx); its own pages stay unserved.
    '/_app',
    '/_document',
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
