import { expect, type Page, test } from '@playwright/test'

import { NOT_FOUND_COPY } from '../../src/lib/notFound/copy'
import { SEARCH_COPY } from '../../src/lib/search/copy'
import { MAIN_LINKS } from '../../src/lib/site/mainLinks'

// Site search and the 404 in a browser (docs/11 §5.1, §5.3; D-29, D-34). CI serves an empty,
// migrated database, so the pages are the starter pages, which search finds by the same rule as
// the index. The search's own rules, the index and the 404's variants have unit and integration
// tests of their own; here are the parts only a browser shows: the form without JavaScript, the
// status, the register, the keys, the bar, and that writing a line makes no request.

/** The 404's line: the field, under its label. */
const lineField = (page: Page) => page.getByLabel(NOT_FOUND_COPY.yourLine)

test.describe('/search', () => {
  test('is never indexed, and asks one labelled question', async ({ page }) => {
    const response = await page.goto('/search')
    expect(response?.status()).toBe(200)
    expect(response?.headers()['x-robots-tag']).toContain('noindex')
    await expect(page).toHaveTitle(`${SEARCH_COPY.title} · IIIC`)
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(SEARCH_COPY.heading)
    await expect(page.getByRole('searchbox', { name: SEARCH_COPY.label })).toBeVisible()
    await expect(page.getByText(SEARCH_COPY.help)).toBeVisible()
  })

  test('finds the pages that hold the words, grouped, with the matching sentence', async ({
    page,
  }) => {
    await page.goto('/search?q=framework')
    await expect(page.getByText(/results? for “framework”/)).toBeVisible()
    const pages = page.getByRole('region', { name: 'Pages' })
    await expect(pages.getByRole('link', { name: /framework/i }).first()).toBeVisible()
    await expect(pages.locator('mark').first()).toHaveText(/framework/i)
    // The field keeps the words, so they can be changed.
    await expect(page.getByRole('searchbox', { name: SEARCH_COPY.label })).toHaveValue('framework')
  })

  test('says plainly when nothing matches, and offers the main pages', async ({ page }) => {
    const response = await page.goto('/search?q=zzqqxxnothing')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(
      `${SEARCH_COPY.nothing} “zzqqxxnothing”`,
    )
    const links = page.getByRole('navigation', { name: SEARCH_COPY.doors }).getByRole('link')
    await expect(links).toHaveCount(MAIN_LINKS.length)
    await expect(links.first()).toHaveAttribute('href', '/')
  })

  test('takes no more than its limit, and treats the query as words only', async ({ page }) => {
    await page.goto(`/search?q=${encodeURIComponent('<b>framework</b>%_ '.repeat(20))}`)
    await expect(page.locator('main b')).toHaveCount(0)
    const value = await page.getByRole('searchbox', { name: SEARCH_COPY.label }).inputValue()
    expect([...value].length).toBeLessThanOrEqual(100)
  })

  test('the header links to it on a wide screen only', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The phone project has no wide screen')
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    const link = page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Search' })
    await expect(link).toBeVisible()
    await link.click()
    await expect(page).toHaveURL(/\/search$/)
    await page.setViewportSize({ width: 1024, height: 800 })
    await expect(link).toBeHidden()
  })
})

test.describe('/search without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('is a form that sends the words and shows the results', async ({ page }) => {
    await page.goto('/search')
    await page.getByRole('searchbox', { name: SEARCH_COPY.label }).fill('framework')
    await page.getByRole('button', { name: SEARCH_COPY.button }).click()
    await expect(page).toHaveURL(/\/search\?q=framework$/)
    await expect(page.getByRole('region', { name: 'Pages' })).toBeVisible()
  })

  test('the 404’s “Where were you headed?” searches too', async ({ page }) => {
    await page.goto('/no-such-page')
    await page.getByRole('searchbox', { name: NOT_FOUND_COPY.whereHeaded }).fill('zzqqxxnothing')
    await page.getByRole('searchbox', { name: NOT_FOUND_COPY.whereHeaded }).press('Enter')
    await expect(page).toHaveURL(/\/search\?q=zzqqxxnothing$/)
    await expect(page.getByRole('heading', { level: 2 })).toContainText('zzqqxxnothing')
  })

  test('the 404’s line still takes words', async ({ page }) => {
    await page.goto('/no-such-page')
    await lineField(page).fill('Fake words written without a script')
    await expect(lineField(page)).toHaveValue('Fake words written without a script')
  })
})

test.describe('the 404', () => {
  for (const [path, register] of [
    ['/no-such-page', null],
    ['/organisations/no-such-page', 'consultancy'],
    ['/institute/no-such-page', 'education'],
  ] as const) {
    test(`answers ${path} with status 404 and the reflective page`, async ({ page }) => {
      const response = await page.goto(path)
      expect(response?.status()).toBe(404)
      if (register) {
        await expect(page.locator('.iiic-site')).toHaveAttribute('data-register', register)
      } else {
        await expect(page.locator('.iiic-site')).not.toHaveAttribute('data-register', /.+/)
      }
      await expect(page.getByText(NOT_FOUND_COPY.kicker, { exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: NOT_FOUND_COPY.whyQuestion })).toHaveAttribute(
        'href',
        '/framework',
      )
      await expect(lineField(page)).toBeVisible()
      await expect(page.getByText(NOT_FOUND_COPY.yourLineHelp)).toBeVisible()
      await expect(page.locator('#scope')).toHaveCount(0)
    })
  }

  test('is the plain page on a counselling path, with the scope statement and no device', async ({
    page,
  }) => {
    const response = await page.goto('/counselling/no-such-page')
    expect(response?.status()).toBe(404)
    await expect(page.locator('.iiic-site')).toHaveAttribute('data-register', 'counselling')
    await expect(page.getByText(NOT_FOUND_COPY.kicker, { exact: true })).toBeVisible()
    await expect(page.locator('main textarea')).toHaveCount(0)
    await expect(page.getByRole('link', { name: NOT_FOUND_COPY.whyQuestion })).toHaveCount(0)
    await expect(page.getByRole('searchbox', { name: NOT_FOUND_COPY.whereHeaded })).toBeVisible()
    await expect(page.locator('#scope')).toContainText('not an emergency service')
  })

  test('takes the keyboard from the line to the actions, the search and the links', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'A keyboard path: the desktop project runs it')
    await page.goto('/no-such-page')
    // Nothing takes the focus by itself.
    await expect(lineField(page)).not.toBeFocused()
    await lineField(page).focus()
    await page.keyboard.type('A fake line')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: NOT_FOUND_COPY.findYourPath })).toBeFocused()
    await page.keyboard.press('Tab')
    // "Take the line with you", where the browser offers a clipboard.
    const take = page.getByRole('button', { name: NOT_FOUND_COPY.takeTheLine })
    if ((await take.count()) > 0) {
      await expect(take).toBeFocused()
      await page.keyboard.press('Tab')
    }
    await expect(page.getByRole('searchbox', { name: NOT_FOUND_COPY.whereHeaded })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Search' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(
      page.getByRole('navigation', { name: NOT_FOUND_COPY.links }).getByRole('link').first(),
    ).toBeFocused()
  })

  test('grows the bar as the line is written, and sends nothing anywhere', async ({ page }) => {
    await page.goto('/no-such-page')
    await page.waitForLoadState('networkidle')
    const bar = page.locator('main span[aria-hidden="true"]')
    await expect(bar).toHaveCount(1)
    const scale = () =>
      bar.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)
    await expect.poll(scale).toBe(0)
    const requests: { method: string; url: string; body: string }[] = []
    page.on('request', (request) =>
      requests.push({
        method: request.method(),
        url: request.url(),
        body: request.postData() ?? '',
      }),
    )
    await lineField(page).fill('zzone two three four five six')
    await expect.poll(scale).toBeCloseTo(0.5, 1)
    await lineField(page).fill('zzone two three four five six seven eight nine ten eleven twelve')
    await expect.poll(scale).toBe(1)
    // Nothing written is stored or sent: no request sends anything, or carries the words.
    const sending = requests.filter(
      ({ method, url, body }) =>
        method !== 'GET' || url.includes('zzone') || body.includes('zzone'),
    )
    expect(sending).toEqual([])
  })

  test('under reduced motion, the bar stands still at full width', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/no-such-page')
    const bar = page.locator('main span[aria-hidden="true"]')
    await expect(bar).toHaveCSS('transform', 'none')
    await lineField(page).fill('one two three')
    await expect(bar).toHaveCSS('transform', 'none')
  })
})
