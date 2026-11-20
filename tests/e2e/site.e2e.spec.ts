import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// The public pages built so far (docs/02); each is held to the same accessibility and layout rules.
const PAGES = ['/', '/framework']

test.describe('Public shell', () => {
  test('home shows the starter page: IIIC’s words, marked candidates, placeholders', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page).toHaveTitle('Indian Institute of Image Catalysts · Subjective Self')
    // docs/12 §3: descriptions are at most 155 characters.
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /^.{1,155}$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-IN')
    await expect(page.getByRole('link', { name: /IIIC/ }).first()).toBeVisible()
    // docs/content/copy-architecture.md §4.1, until the page is published in the CMS (D-51).
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Know Yourself. Every Answer Follows.',
    )
    await expect(
      page.getByText('Counselling transforms how people perceive, interpret and understand.'),
    ).toBeVisible()
    // Candidate copy is marked, and an unsupplied fact is a placeholder (I-41, I-10).
    await expect(page.locator('[data-candidate="I-41"]').first()).toBeVisible()
    await expect(page.locator('.iiic-todo[data-todo="I-10"]').first()).toHaveText(
      /^\[\[TODO: .+, I-10\]\]$/,
    )
    await expect(page.locator('.iiic-band-yellow [lang="sa"]')).toHaveText('आत्मानं विद्धि')
    await expect(page.locator('footer')).toContainText('+91 96240 46464')
  })

  test("the tab icon is IIIC's own, as an SVG and as an .ico (D-48)", async ({ page, request }) => {
    await page.goto('/')
    await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute(
      'href',
      '/icon.svg',
    )
    const svg = await request.get('/icon.svg')
    expect(svg.status()).toBe(200)
    expect(svg.headers()['content-type']).toContain('image/svg+xml')
    const ico = await request.get('/favicon.ico')
    expect(ico.status()).toBe(200)
    expect(ico.headers()['content-type']).toMatch(/image\/(x-icon|vnd\.microsoft\.icon)/)
  })

  test('the skip link is the first stop and moves focus to main', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#main$/)
  })

  for (const path of PAGES) {
    test(`no serious or critical accessibility violations on ${path}`, async ({ page }) => {
      await page.goto(path)
      const results = await new AxeBuilder({ page }).analyze()
      const blocking = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      )
      expect(blocking, JSON.stringify(blocking.map((v) => v.id))).toEqual([])
    })
  }

  for (const path of PAGES) {
    test(`no horizontal scroll from 320 to 1600 px on ${path}`, async ({ page }) => {
      for (const width of [320, 768, 1600]) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(path)
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        )
        expect(overflow, `${width} px`).toBeLessThanOrEqual(0)
      }
    })
  }

  test('the framework page: the comparison as a table, IIIC’s lines, one closing band', async ({
    page,
  }) => {
    const response = await page.goto('/framework')
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle('Framework · IIIC')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'You Are the Subject of Your Life.',
    )
    // docs/11 §3.2: the plain two-column view, five pairs, each column named.
    const comparison = page.getByRole('table')
    await expect(comparison.getByRole('columnheader')).toHaveText([
      'Living as the object',
      'Living as the subject',
    ])
    await expect(comparison.locator('tbody tr')).toHaveCount(5)
    await expect(page.getByText('The aim is not motivation, but mental clarity.')).toBeVisible()
    await expect(page.locator('.iiic-band-yellow')).toHaveCount(1)
    // The footer follows the closing band at once, as in the kit’s landing template.
    const gap = await page.evaluate(() => {
      const band = document.querySelector('.iiic-band-yellow')?.getBoundingClientRect()
      const footer = document.querySelector('footer')?.getBoundingClientRect()
      return band && footer ? Math.round(footer.top - band.bottom) : null
    })
    expect(gap).toBe(0)
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
