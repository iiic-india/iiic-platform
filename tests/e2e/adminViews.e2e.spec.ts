import { expect, test } from '@playwright/test'

import { siteOrigin } from '../../src/lib/seo/site'

// The views of M5 C on the built app (docs/18 §6, §9; CLAUDE.md #6): each one sends a visitor to
// the sign-in before it reads anything, and the audit log's CSV refuses a request with no staff
// session. The signed-in paths, two-factor and roles included, are proved in
// tests/unit/adminViewsAccess.spec.ts and against Postgres in tests/int/adminViews.int.spec.ts.

/** Payload reads a session cookie only when the request names an allowed origin. */
const asBrowser = { headers: { Origin: siteOrigin() } }

const VIEWS = ['today', 'calendar', 'reports', 'search?q=fake', 'people/1', 'proof', 'settings']

test.describe('The admin views', () => {
  for (const view of VIEWS) {
    test(`/admin/${view} is not reachable without signing in`, async ({ page }) => {
      await page.goto(`/admin/${view}`)
      // The admin sends a visitor to sign in, or, while no account exists yet, to make the first.
      await expect(page).toHaveURL(/\/admin\/(login|create-first-user)/)
      expect(page.url()).not.toContain(view.split('?')[0])
    })
  }

  test('the audit log’s CSV refuses a visitor', async ({ request }) => {
    const response = await request.post('/api/admin-views/audit-log-csv', {
      ...asBrowser,
      data: { code: '000000' },
    })
    expect(response.status()).toBe(401)
    expect(response.headers()['cache-control']).toContain('no-store')
    expect(await response.json()).toMatchObject({ code: 'sign-in' })
  })
})
