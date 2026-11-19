import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.describe('Public shell', () => {
  test('home renders the shell with placeholders, not invented copy', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle('Indian Institute of Image Catalysts')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-IN')
    await expect(page.getByRole('link', { name: /IIIC/ }).first()).toBeVisible()
    await expect(page.locator('h1 .iiic-todo')).toHaveText(/^\[\[TODO: .+, I-41\]\]$/)
    await expect(page.locator('footer')).toContainText('+91 96240 46464')
  })

  test('the skip link is the first stop and moves focus to main', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#main$/)
  })

  test('no serious or critical accessibility violations', async ({ page }) => {
    await page.goto('/')
    const results = await new AxeBuilder({ page }).analyze()
    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    )
    expect(blocking, JSON.stringify(blocking.map((v) => v.id))).toEqual([])
  })

  test('no horizontal scroll at the page width', async ({ page }) => {
    await page.goto('/')
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('the menu button opens the navigation on a phone', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'The menu button only shows on narrow screens')
    await page.goto('/')
    const toggle = page.getByRole('button', { name: 'Menu' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Framework' }),
    ).toBeVisible()
  })

  test('health reports the database', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.status()).toBe(200)
    expect(response.headers()['cache-control']).toContain('no-store')
    expect(await response.json()).toMatchObject({ status: 'ok', database: 'ok' })
  })
})
