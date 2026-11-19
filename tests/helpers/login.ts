import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/** Signs in through the admin login form and waits for the dashboard. */
export async function login(page: Page, user: { email: string; password: string }): Promise<void> {
  await page.goto('/admin/login')
  await page.fill('#field-email', user.email)
  await page.fill('#field-password', user.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/admin$/)
  await expect(page.locator('span[title="Dashboard"]').first()).toBeVisible()
}
