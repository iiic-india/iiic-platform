import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.describe('Public shell', () => {
  test('home renders the shell with placeholders, not invented copy', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle('Indian Institute of Image Catalysts · Subjective Self')
    // docs/12 §3: descriptions are at most 155 characters.
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /^.{1,155}$/)
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

  test('no horizontal scroll from 320 to 1600 px', async ({ page }) => {
    for (const width of [320, 768, 1600]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      )
      expect(overflow, `${width} px`).toBeLessThanOrEqual(0)
    }
  })

  test('an unknown address gets the site’s own 404 inside the shell', async ({ page }) => {
    const response = await page.goto('/no-such-page')
    expect(response?.status()).toBe(404)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-IN')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found')
    await expect(page.locator('footer')).toContainText('+91 96240 46464')
  })

  test('Escape closes the menu and returns focus to the button', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'The menu button only shows on narrow screens')
    await page.goto('/')
    const toggle = page.getByRole('button', { name: 'Menu' })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toBeFocused()
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

  test('health is public and reports only the status, the database and the commit', async ({
    request,
  }) => {
    // Public by design (docs/12 §6): no sign-in, no cookies, nothing about data.
    const response = await request.get('/api/health')
    expect(response.status()).toBe(200)
    expect(response.headers()['cache-control']).toContain('no-store')
    const body = await response.json()
    expect(body).toMatchObject({ status: 'ok', database: 'ok' })
    expect(Object.keys(body).sort()).toEqual(['commit', 'database', 'status'])
  })
})
