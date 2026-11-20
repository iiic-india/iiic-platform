import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { enterCode, login, signIn } from '../helpers/login'
import {
  cleanupTestUsers,
  newcomer,
  recoverer,
  seedTestUsers,
  testUser,
  totpCode,
} from '../helpers/seedUser'

let ids: { ownerId: number | string; newcomerId: number | string }

/** Serious and critical axe findings on the page as it is now. */
async function blockingViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze()
  return results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => violation.id)
}

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

  test('the code step asks in one labelled field, says what went wrong, and passes axe', async ({
    page,
  }) => {
    await signIn(page, { email: testUser.email, password: testUser.password })
    await page.waitForURL(/\/admin\/verify-totp/)
    expect(await blockingViolations(page)).toEqual([])

    const field = page.getByLabel('Code', { exact: true })
    await expect(field).toHaveAttribute('autocomplete', 'one-time-code')
    // A short code is caught before it reaches the server, so it does not count as an attempt.
    await enterCode(page, '123')
    // By its id: Next.js adds a role="alert" route announcer of its own to every page.
    const error = page.locator('#two-factor-code-error')
    await expect(error).toHaveText('Enter the six-digit code from your authenticator app.')
    await expect(error).toHaveAttribute('role', 'alert')
    await expect(field).toBeFocused()
    await expect(field).toHaveAttribute('aria-invalid', 'true')

    await enterCode(page, totpCode(testUser.totpSecret))
    await page.waitForURL(/\/admin$/)
  })

  test('someone without an authenticator sets one up before reaching anything', async ({
    page,
  }) => {
    await signIn(page, newcomer)
    await page.waitForURL(/\/admin\/setup-totp/)
    await page.goto('/admin/collections/media')
    await expect(page).toHaveURL(/\/admin\/setup-totp/)
    expect(await blockingViolations(page)).toEqual([])
    await expect(page.getByAltText('QR code for your authenticator app')).toBeVisible()

    await page.getByText('Enter a setup key instead').click()
    const secret = (await page.locator('code').first().innerText()).replace(/\s/g, '')
    expect(secret).toMatch(/^[A-Z2-7]{32}$/)
    await enterCode(page, totpCode(secret))
    await page.waitForURL(/\/admin(\/collections\/media)?$/)
    await expect(page.locator('h1, span[title="Dashboard"]').first()).toBeVisible()
  })

  test('an owner resets someone’s two-factor, and they set it up again when they next sign in', async ({
    page,
    browser,
  }) => {
    await login(page, testUser)
    await page.goto(`/admin/collections/users/${ids.ownerId}`)
    await expect(page.getByRole('button', { name: 'Reset two-factor' })).toHaveCount(0)

    await page.goto(`/admin/collections/users/${ids.newcomerId}`)
    await page.getByRole('button', { name: 'Reset two-factor' }).first().click()
    await page.locator('#confirm-action').click()
    await expect(page.getByText('Two-factor reset.', { exact: false })).toBeVisible()

    const context = await browser.newContext()
    const theirPage = await context.newPage()
    await signIn(theirPage, newcomer)
    await theirPage.waitForURL(/\/admin\/setup-totp/)
    await context.close()
  })

  test('someone who lost their authenticator signs in with a recovery code and sets up a new one', async ({
    page,
    browser,
  }) => {
    await login(page, recoverer)
    await page.getByRole('button', { name: 'Create recovery codes' }).click()
    const codes = page.locator('ol li code')
    await expect(codes).toHaveCount(10)
    // Focus moves to the line above the codes, so a screen reader reads them next.
    await expect(
      page.getByText('Save these codes somewhere safe now', { exact: false }),
    ).toBeFocused()
    await expect(page.getByRole('button', { name: 'Copy codes' })).toBeVisible()
    const saved = await codes.allInnerTexts()

    const context = await browser.newContext()
    const theirPage = await context.newPage()
    await signIn(theirPage, { email: recoverer.email, password: recoverer.password })
    await theirPage.waitForURL(/\/admin\/verify-totp/)
    await theirPage.getByText('Lost your authenticator?').click()
    const field = theirPage.getByLabel('Recovery code')
    await field.fill('AAAA-AAAA-AAAA-AAAA')
    await theirPage.getByRole('button', { name: 'Use recovery code' }).click()
    await expect(theirPage.locator('#recovery-code-error')).toHaveText(
      'That code is not one of your unused recovery codes. Check it against your saved list.',
    )
    // The typed code stays, so a slip can be corrected.
    await expect(field).toHaveValue('AAAA-AAAA-AAAA-AAAA')

    await field.fill(saved[0] ?? '')
    await theirPage.getByRole('button', { name: 'Use recovery code' }).click()
    await theirPage.waitForURL(/\/admin\/setup-totp/)
    await theirPage.getByText('Enter a setup key instead').click()
    const secret = (await theirPage.locator('code').first().innerText()).replace(/\s/g, '')
    await enterCode(theirPage, totpCode(secret))
    await theirPage.waitForURL(/\/admin$/)
    await expect(
      theirPage.getByText('You have nine unused recovery codes.', { exact: false }),
    ).toBeVisible()

    // Replacing a set asks first, and cancelling keeps the codes.
    await theirPage.getByRole('button', { name: 'Create new codes' }).click()
    await expect(theirPage.getByRole('heading', { name: 'Create new codes?' })).toBeVisible()
    await theirPage.locator('#confirm-cancel').click()
    await expect(theirPage.getByRole('heading', { name: 'Create new codes?' })).toHaveCount(0)
    await context.close()

    // The session that was still open elsewhere has ended.
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin\/login/)
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
