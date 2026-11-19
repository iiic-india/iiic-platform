import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

test.describe('Admin', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => seedTestUser())
  test.afterAll(async () => cleanupTestUser())

  test('a staff user signs in and reaches the dashboard', async ({ page }) => {
    await login(page, testUser)
    await page.goto('/admin/collections/users')
    await expect(page.locator('h1', { hasText: 'Staff users' }).first()).toBeVisible()
  })

  test('the admin is not reachable without signing in', async ({ page }) => {
    await page.goto('/admin/collections/users')
    await expect(page).toHaveURL(/\/admin\/login/)
  })

  test('signing in sets only the session cookie, HttpOnly and SameSite=Lax (docs/12 §10)', async ({
    page,
    context,
  }) => {
    await login(page, testUser)
    const cookies = await context.cookies()
    expect(cookies.map((cookie) => cookie.name)).toEqual(['payload-token'])
    expect(cookies[0]).toMatchObject({ httpOnly: true, sameSite: 'Lax' })
  })

  test('the admin runs under the CSP without a violation (D-42)', async ({ page }) => {
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
    await login(page, testUser)
    for (const path of ['/admin', '/admin/collections/users', '/admin/collections/media']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
    }
    expect(violations).toEqual([])
  })
})
