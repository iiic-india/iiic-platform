import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

import { totpCode } from './seedUser'

/**
 * Enters a code as a person would: in IIIC's verify page (one field), or in payload-totp's
 * set-up page (one box per digit).
 */
export async function enterCode(page: Page, code: string): Promise<void> {
  const field = page.locator('#two-factor-code, form input[maxlength="1"]').first()
  await field.waitFor()
  if ((await field.getAttribute('id')) === 'two-factor-code') {
    await field.fill(code)
    await field.press('Enter')
    return
  }
  await field.click()
  await page.keyboard.type(code)
}

/** Signs in with email and password and, for an account with an authenticator, its code. */
export async function signIn(
  page: Page,
  user: { email: string; password: string; totpSecret?: string },
): Promise<void> {
  await page.goto('/admin/login')
  await page.fill('#field-email', user.email)
  await page.fill('#field-password', user.password)
  await page.click('button[type="submit"]')
  if (user.totpSecret) {
    await page.waitForURL(/\/admin\/verify-totp/)
    await enterCode(page, totpCode(user.totpSecret))
  }
}

/** Signs in and waits for the dashboard. */
export async function login(
  page: Page,
  user: { email: string; password: string; totpSecret: string },
): Promise<void> {
  await signIn(page, user)
  await page.waitForURL(/\/admin$/)
  await expect(page.locator('span[title="Dashboard"]').first()).toBeVisible()
}
