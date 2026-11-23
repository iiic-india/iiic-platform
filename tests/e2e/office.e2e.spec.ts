import { expect, test } from '@playwright/test'

import { siteOrigin } from '../../src/lib/seo/site'

// The office's money and calendar actions on the built app (docs/16 §12, E; CLAUDE.md #6): every
// endpoint refuses a request with no staff session before it reads anything, and the working-hours
// view sends a visitor to the sign-in. The signed-in paths, two-factor and roles included, are
// proved against Postgres in tests/int/officeActions.int.spec.ts.

/** Payload reads a session cookie only when the request names an allowed origin. */
const asBrowser = { headers: { Origin: siteOrigin() } }

const ENDPOINTS = [
  ['get', '/api/bookings/1/cancel-preview'],
  ['post', '/api/bookings/1/cancel'],
  ['post', '/api/bookings/1/reschedule'],
  ['post', '/api/bookings/1/confirm-time'],
  ['post', '/api/bookings/1/payment-link'],
  ['post', '/api/refunds/1/decide'],
  ['post', '/api/refunds/1/send'],
  ['get', '/api/availability-rules/bookable-times?option=1:fake'],
] as const

test.describe('Office actions', () => {
  for (const [method, path] of ENDPOINTS) {
    test(`${method.toUpperCase()} ${path} refuses a visitor`, async ({ request }) => {
      const response =
        method === 'get'
          ? await request.get(path, asBrowser)
          : await request.post(path, { ...asBrowser, data: {} })
      expect(response.status()).toBe(401)
      expect(response.headers()['cache-control']).toContain('no-store')
      expect(await response.json()).toMatchObject({ code: 'sign-in' })
    })
  }

  test('the working-hours view is not reachable without signing in', async ({ page }) => {
    await page.goto('/admin/working-hours')
    // The admin sends a visitor to sign in, or, while no account exists yet, to make the first.
    await expect(page).toHaveURL(/\/admin\/(login|create-first-user)/)
    expect(page.url()).not.toContain('working-hours')
  })
})
