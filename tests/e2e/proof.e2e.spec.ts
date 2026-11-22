import { expect, test } from '@playwright/test'

import { PROOF_COPY } from '../../src/lib/proof/copy'
import { PROOF_PAGE } from '../../src/lib/seo/appPages'
import { canonicalUrl, siteOrigin, TITLE_SUFFIX } from '../../src/lib/seo/site'

// Proof on the running site (docs/02; copy architecture §4.7; D-37). CI serves an empty, migrated
// database, so every part of Proof shows its honest empty state: no review, no filter, no rating
// and no Review markup, and nothing written in a review's place (CLAUDE.md #1). Axe and the
// widths are checked with every other page (tests/e2e/site.e2e.spec.ts).
const ORIGIN = siteOrigin()

test.describe('Proof while no review is published', () => {
  test('/proof says so honestly, with its title, description and canonical address', async ({
    page,
  }) => {
    const response = await page.goto('/proof')
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle(`${PROOF_PAGE.title}${TITLE_SUFFIX}`)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      PROOF_PAGE.description,
    )
    const canonical = page.locator('link[rel="canonical"]')
    await expect(canonical).toHaveCount(1)
    expect(new URL((await canonical.getAttribute('href')) ?? '').href).toBe(
      canonicalUrl('/proof', ORIGIN),
    )
    // In the default register (docs/02): paper, with no register of its own on the shell.
    expect(await page.locator('.iiic-site').getAttribute('data-register')).toBeNull()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(PROOF_COPY.title)
    for (const part of [PROOF_COPY.voices, PROOF_COPY.stories, PROOF_COPY.cases]) {
      const section = page.locator(`section#${part.anchor}`)
      await expect(section.getByRole('heading', { level: 3 })).toHaveText(part.emptyHeading)
    }
    // Nothing invented: no card, no filter, no stars, no placeholder.
    await expect(page.locator('main .iiic-card-proof')).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: PROOF_COPY.voices.filterLabel })).toHaveCount(
      0,
    )
    await expect(page.locator('main')).not.toContainText('[[')
    await expect(page.locator('main')).not.toContainText('★')
  })

  test('carries no Review or rating markup (docs/12 §3)', async ({ page }) => {
    await page.goto('/proof')
    const data = await page.locator('script[type="application/ld+json"]').allTextContents()
    expect(data.length).toBeGreaterThan(0)
    for (const graph of data) {
      expect(graph).not.toMatch(/"@type":"(?:Review|AggregateRating|Rating)"|ratingValue/)
    }
  })

  test('keeps its canonical address under any filter, and ignores a door it does not know', async ({
    page,
  }) => {
    for (const path of ['/proof?door=counselling', '/proof?door=no-such-door']) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(200)
      const href = await page.locator('link[rel="canonical"]').getAttribute('href')
      expect(new URL(href ?? '').href, path).toBe(canonicalUrl('/proof', ORIGIN))
    }
  })

  test('opens at In their words from a link to #voices', async ({ page }) => {
    await page.goto('/proof#voices')
    await expect(page.locator('section#voices')).toBeInViewport()
  })

  test('/proof/anything is the site’s 404, as no case study is published (I-16)', async ({
    page,
  }) => {
    const response = await page.goto('/proof/no-such-case-study')
    expect(response?.status()).toBe(404)
  })
})
