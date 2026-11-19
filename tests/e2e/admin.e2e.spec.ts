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
})
