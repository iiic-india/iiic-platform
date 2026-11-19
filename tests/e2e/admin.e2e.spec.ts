import { expect, test } from '@playwright/test'

import { enterCode, login, signIn } from '../helpers/login'
import { cleanupTestUsers, newcomer, seedTestUsers, testUser, totpCode } from '../helpers/seedUser'

let ids: { ownerId: number | string; newcomerId: number | string }

test.describe('Admin', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    ids = await seedTestUsers()
  })
  test.afterAll(async () => cleanupTestUsers())

  test('a staff user signs in with their code and reaches the dashboard', async ({ page }) => {
    await login(page, testUser)
    await page.goto('/admin/collections/users')
    await expect(page.locator('h1', { hasText: 'Staff users' }).first()).toBeVisible()
  })

  test('the admin is not reachable without signing in', async ({ page }) => {
    await page.goto('/admin/collections/users')
    await expect(page).toHaveURL(/\/admin\/login/)
  })

  test('the password alone reaches nothing until the code is entered', async ({ page }) => {
    await signIn(page, { email: testUser.email, password: testUser.password })
    await page.waitForURL(/\/admin\/verify-totp/)
    await page.goto('/admin/collections/users')
    await expect(page).toHaveURL(/\/admin\/verify-totp/)
  })

  test('someone without an authenticator sets one up before reaching anything', async ({
    page,
  }) => {
    await signIn(page, newcomer)
    await page.waitForURL(/\/admin\/setup-totp/)
    await page.goto('/admin/collections/media')
    await expect(page).toHaveURL(/\/admin\/setup-totp/)

    await page.getByRole('button', { name: 'Enter a setup key instead' }).click()
    const secret = (await page.locator('code').first().innerText()).replace(/\s/g, '')
    expect(secret).toMatch(/^[A-Z2-7]{16,}$/)
    await enterCode(page, totpCode(secret))
    await page.waitForURL(/\/admin(\/collections\/media)?$/)
    await expect(page.locator('h1, span[title="Dashboard"]').first()).toBeVisible()
  })

  test('an owner resets someone’s two-factor, and they set it up again when they next sign in', async ({
    page,
    browser,
  }) => {
    await login(page, testUser)
    await page.goto(`/admin/collections/users/${ids.newcomerId}`)
    await expect(page.getByRole('button', { name: 'Reset two-factor' }).first()).toBeVisible()
    await page.goto(`/admin/collections/users/${ids.ownerId}`)
    await expect(page.getByRole('button', { name: 'Reset two-factor' })).toHaveCount(0)

    const reset = await page.request.post(`/api/users/${ids.newcomerId}/reset-two-factor`)
    expect(reset.status()).toBe(200)

    const context = await browser.newContext()
    const theirPage = await context.newPage()
    await signIn(theirPage, newcomer)
    await theirPage.waitForURL(/\/admin\/setup-totp/)
    await context.close()
  })

  test('signing in sets only the session and the code cookies, HttpOnly and SameSite=Lax (docs/12 §10)', async ({
    page,
    context,
  }) => {
    await login(page, testUser)
    const cookies = await context.cookies()
    expect(cookies.map((cookie) => cookie.name).sort()).toEqual(['payload-token', 'payload-totp'])
    for (const cookie of cookies) {
      expect(cookie, cookie.name).toMatchObject({ httpOnly: true, sameSite: 'Lax' })
    }
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
