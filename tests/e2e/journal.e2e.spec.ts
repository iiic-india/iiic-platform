import { expect, test } from '@playwright/test'

import { JOURNAL_PAGE } from '../../src/lib/seo/appPages'
import { canonicalUrl, siteOrigin, TITLE_SUFFIX } from '../../src/lib/seo/site'

// The Journal on the running site (docs/02; docs/content/copy-architecture.md §4.8). CI serves
// an empty, migrated database, so the Journal shows its honest empty state (I-19), and every
// article and topic address is a 404 in the Journal's own register.
const ORIGIN = siteOrigin()

test.describe('The Journal while no article is published', () => {
  test('/journal says so honestly, with its title, description and canonical address', async ({
    page,
  }) => {
    const response = await page.goto('/journal')
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle(`${JOURNAL_PAGE.title}${TITLE_SUFFIX}`)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      JOURNAL_PAGE.description,
    )
    const canonical = page.locator('link[rel="canonical"]')
    await expect(canonical).toHaveCount(1)
    expect(new URL((await canonical.getAttribute('href')) ?? '').href).toBe(
      canonicalUrl('/journal', ORIGIN),
    )
    // In the education register (docs/02).
    await expect(page.locator('.iiic-site')).toHaveAttribute('data-register', 'education')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Journal')
    await expect(page.getByRole('heading', { level: 2, name: 'No articles yet' })).toBeVisible()
    // Nothing invented: no article, no topic, no page links, no placeholder.
    await expect(page.locator('main article')).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Topics' })).toHaveCount(0)
    await expect(page.locator('.iiic-pagination')).toHaveCount(0)
    await expect(page.locator('main')).not.toContainText('[[')
  })

  test('the footer’s Journal link leads there', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('contentinfo').getByRole('link', { name: 'Journal', exact: true }).click()
    await expect(page).toHaveURL(/\/journal$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Journal')
  })

  for (const path of [
    '/journal/no-such-article',
    '/journal/topic/no-such-topic',
    '/journal/page/2',
    '/journal/topic/no-such-topic/page/2',
  ]) {
    test(`${path} answers 404, in the education register, with no canonical address`, async ({
      page,
    }) => {
      const response = await page.goto(path)
      expect(response?.status()).toBe(404)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found')
      await expect(page.locator('.iiic-site')).toHaveAttribute('data-register', 'education')
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
      await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0)
    })
  }
})

// Checks that only make requests: once, in the desktop project.
test.describe('The Journal’s addresses, as requests', () => {
  test.skip(
    ({ isMobile }) => isMobile,
    'These checks only make requests: the desktop project runs them',
  )

  test('page 1 of the Journal lives at the Journal’s own address', async ({ request }) => {
    const response = await request.get('/journal/page/1', { maxRedirects: 0 })
    expect(response.status()).toBe(308)
    expect(new URL(response.headers()['location'] ?? '', ORIGIN).pathname).toBe('/journal')
  })

  test('an article that is not published has no share image either', async ({ request }) => {
    expect((await request.get('/og/journal/no-such-article')).status()).toBe(404)
    expect((await request.get('/og/journal/topic/no-such-topic')).status()).toBe(404)
    const image = await request.get('/og/journal')
    expect(image.status()).toBe(200)
    expect(image.headers()['content-type']).toBe('image/png')
  })
})
