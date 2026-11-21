import AxeBuilder from '@axe-core/playwright'
import { expect, type Locator, type Page, test } from '@playwright/test'

import { FLIP_COPY } from '../../src/components/experience/copy'
import { FOUNDERS_IIIC_LINES } from '../../src/content/starter/founders'
import { FRAMEWORK } from '../../src/content/starter/framework'
import type { ComparisonBlock } from '../../src/payload-types'

// The experience devices on the narrative pages (docs/11 §3, §10), in a browser: the bar (§3.1),
// Flip the line (§3.2), the sticky question (§3.3) and the chapters (§3.5). The server has an
// empty database, so each page is its starter page. The parts only a browser can show are
// here: the keys, the stylesheet's view without JavaScript and on paper, reduced motion, the
// layout and its shifts. The client components' logic has unit tests of its own.

const NARRATIVE = ['/', '/framework', '/founders'] as const

/** The framework page's five pairs, in the copy's order. */
const PAIRS = (
  FRAMEWORK.layout.find((block) => block.blockType === 'comparison') as ComparisonBlock
).pairs.map((pair) => ({ object: pair.left, subject: pair.right }))
const [FIRST, SECOND] = PAIRS as [(typeof PAIRS)[number], (typeof PAIRS)[number]]

const INSIGHT_TITLES = [
  FOUNDERS_IIIC_LINES.empireTitle,
  FOUNDERS_IIIC_LINES.decisionsTitle,
  FOUNDERS_IIIC_LINES.systemsTitle,
  FOUNDERS_IIIC_LINES.peopleTitle,
  FOUNDERS_IIIC_LINES.gratitudeTitle,
  FOUNDERS_IIIC_LINES.brandTitle,
]

/** The bar: the header's one span, hidden from assistive technology. */
const barOn = (page: Page) => page.locator('header.iiic-header > span[aria-hidden="true"]')

/** A line of the flip, named as a screen reader names it: by the side it shows. */
const line = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

/** The flip's lines, the stylesheet's hidden ones included. */
const flipLines = (page: Page) => page.locator('main ul button[aria-pressed]')

/** The chapters of the founders' page. */
const chapters = (page: Page) => page.locator('main [data-reveal]')

/**
 * Waits until React has taken over an element drawn on the server: until then a key press
 * reaches no handler. React keeps the props it drew an element with on the element itself.
 */
async function hydrated(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate((element) =>
        Object.keys(element).some((key) => key.startsWith('__reactProps')),
      ),
    )
    .toBe(true)
}

/** Whether an element, or one around it, stays in view as the page scrolls. */
const isSticky = (locator: Locator) =>
  locator.evaluate((element) => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      if (getComputedStyle(node).position === 'sticky') return true
    }
    return false
  })

/** The width the bar is drawn at, as a share of the header's. */
async function barShare(page: Page): Promise<number> {
  const [bar, header] = await Promise.all([
    barOn(page).evaluate((element) => element.getBoundingClientRect().width),
    page.locator('header.iiic-header').evaluate((element) => element.getBoundingClientRect().width),
  ])
  return bar / header
}

/** Scrolls the window to a share of the way down the page. */
async function scrollToShare(page: Page, share: number) {
  await page.evaluate((to) => {
    const range = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo(0, Math.round(range * to))
  }, share)
}

/** Brings each chapter into view in turn, and waits until each has come in. */
async function readEveryChapter(page: Page) {
  for (const chapter of await chapters(page).all()) {
    await chapter.scrollIntoViewIfNeeded()
    await expect(chapter).toHaveCSS('opacity', '1')
  }
}

test.describe('The bar (docs/11 §3.1)', () => {
  for (const path of NARRATIVE) {
    test(`grows with the reader’s progress on ${path}`, async ({ page }) => {
      await page.goto(path)
      await expect(barOn(page)).toHaveCount(1)
      await expect(barOn(page)).toHaveAttribute('aria-hidden', 'true')
      expect(await barShare(page)).toBeLessThan(0.05)
      await scrollToShare(page, 0.5)
      await expect.poll(() => barShare(page)).toBeGreaterThan(0.35)
      expect(await barShare(page)).toBeLessThan(0.65)
      await scrollToShare(page, 1)
      await expect.poll(() => barShare(page)).toBeGreaterThan(0.98)
    })
  }

  // Counselling and booking above all carry no device (docs/11 §2, principle 6).
  for (const path of ['/counselling', '/organisations', '/book/session']) {
    test(`is not on ${path}`, async ({ page }) => {
      await page.goto(path)
      await expect(page.locator('header.iiic-header')).toBeVisible()
      await expect(barOn(page)).toHaveCount(0)
    })
  }
})

test.describe('Flip the line (docs/11 §3.2)', () => {
  test('a line turns with Enter and back with Space, and focus stays on it', async ({ page }) => {
    await page.goto('/framework')
    const first = line(page, FIRST.object)
    await hydrated(first)
    await expect(first).toHaveAttribute('aria-pressed', 'false')
    await expect(first).toHaveAccessibleDescription(FLIP_COPY.toSubject)
    await first.focus()
    await page.keyboard.press('Enter')
    const turned = line(page, FIRST.subject)
    await expect(turned).toHaveAttribute('aria-pressed', 'true')
    await expect(turned).toBeFocused()
    await expect(turned).toHaveAccessibleDescription(FLIP_COPY.toObject)
    await expect(turned.locator('[data-face="subject"]')).toBeVisible()
    await expect(turned.locator('[data-face="object"]')).toBeHidden()
    await page.keyboard.press('Space')
    await expect(line(page, FIRST.object)).toHaveAttribute('aria-pressed', 'false')
    await expect(line(page, FIRST.object)).toBeFocused()
    // The next stop is the next line, and Space turns it.
    await page.keyboard.press('Tab')
    await expect(line(page, SECOND.object)).toBeFocused()
    await page.keyboard.press('Space')
    await expect(line(page, SECOND.subject)).toHaveAttribute('aria-pressed', 'true')
  })

  test('Flip all turns every line and back; Show both opens the plain table', async ({ page }) => {
    await page.goto('/framework')
    const flipAll = page.getByRole('button', { name: FLIP_COPY.flipAll })
    await hydrated(flipAll)
    await flipAll.focus()
    await page.keyboard.press('Enter')
    await expect(flipAll).toHaveAttribute('aria-pressed', 'true')
    for (const pair of PAIRS) {
      await expect(line(page, pair.subject)).toHaveAttribute('aria-pressed', 'true')
    }
    await page.keyboard.press('Enter')
    await expect(flipAll).toHaveAttribute('aria-pressed', 'false')
    for (const pair of PAIRS) {
      await expect(line(page, pair.object)).toHaveAttribute('aria-pressed', 'false')
    }
    // The table waits behind its link, and opens where the link leads.
    await expect(page.locator('main table')).toBeHidden()
    await page.getByRole('link', { name: FLIP_COPY.showBoth }).focus()
    await page.keyboard.press('Enter')
    const table = page.getByRole('table')
    await expect(table).toBeVisible()
    await expect(table).toBeInViewport()
    await expect(table.getByRole('rowheader')).toHaveText(PAIRS.map((pair) => pair.object))
    await expect(table.getByRole('cell')).toHaveText(PAIRS.map((pair) => pair.subject))
  })

  test('a flip moves nothing on the page: every line keeps its height', async ({ page }) => {
    await page.goto('/framework')
    const flipAll = page.getByRole('button', { name: FLIP_COPY.flipAll })
    await hydrated(flipAll)
    const heights = () =>
      flipLines(page).evaluateAll((buttons) =>
        buttons.map((button) => button.getBoundingClientRect().height),
      )
    const before = await heights()
    expect(before).toHaveLength(PAIRS.length)
    await flipAll.click()
    await expect(page.locator('main ul button[aria-pressed="false"]')).toHaveCount(0)
    expect(await heights()).toEqual(before)
  })

  test('the table also opens from its address, as a link to it does', async ({ page }) => {
    await page.goto('/framework')
    const href = await page.getByRole('link', { name: FLIP_COPY.showBoth }).getAttribute('href')
    expect(href).toMatch(/^#\w+$/)
    await page.goto(`/framework${href}`)
    await expect(page.getByRole('table')).toBeVisible()
  })
})

test.describe('The sticky question (docs/11 §3.3)', () => {
  test('the framework’s “What changes” stays beside its answers on wide screens only', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/framework')
    const question = page.getByRole('heading', { level: 2, name: 'What changes' })
    expect(await isSticky(question)).toBe(!isMobile)
  })

  test('the six insights: the question and the titles stay in view and mark the card read', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'The titles beside the cards are for wide screens; phones stack the cards')
    await page.goto('/founders')
    const titles = page.getByRole('navigation', { name: 'Six Insights' })
    await expect(titles.getByRole('link')).toHaveText(INSIGHT_TITLES)
    const systems = titles.getByRole('link', { name: FOUNDERS_IIIC_LINES.systemsTitle })
    await hydrated(systems)
    await systems.click()
    await expect(systems).toHaveAttribute('aria-current', 'true')
    await expect(titles.locator('[aria-current="true"]')).toHaveCount(1)
    // Two cards down the list, the section's question is still in view beside them.
    await expect(page.getByRole('heading', { level: 2, name: 'Six Insights' })).toBeInViewport()
    const last = titles.getByRole('link', { name: FOUNDERS_IIIC_LINES.brandTitle })
    await last.click()
    await expect(last).toHaveAttribute('aria-current', 'true')
    await expect(titles.locator('[aria-current="true"]')).toHaveCount(1)
  })

  test('on a phone the six insights are cards, one under another, each with its title', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'Phones only')
    await page.goto('/founders')
    await expect(page.getByRole('navigation', { name: 'Six Insights' })).toBeHidden()
    await expect(page.locator('main article h3')).toHaveText(INSIGHT_TITLES)
    const lefts = await page
      .locator('main article')
      .evaluateAll((cards) => cards.map((card) => Math.round(card.getBoundingClientRect().left)))
    expect(new Set(lefts).size).toBe(1)
  })
})

test.describe('Chapters (docs/11 §3.5)', () => {
  test('a chapter below the window waits, and comes in once, when it is reached', async ({
    page,
  }) => {
    await page.goto('/founders')
    await expect(chapters(page)).toHaveCount(4)
    const last = chapters(page).last()
    await expect(last).toHaveAttribute('data-reveal', 'waiting')
    await expect(last).toHaveCSS('opacity', '0')
    await last.scrollIntoViewIfNeeded()
    await expect(last).toHaveAttribute('data-reveal', 'in')
    await expect(last).toHaveCSS('opacity', '1')
    await page.evaluate(() => window.scrollTo(0, 0))
    await last.scrollIntoViewIfNeeded()
    await expect(last).toHaveAttribute('data-reveal', 'in')
  })

  test('the rupee figures are set in Fraunces, as the headline is', async ({ page }) => {
    await page.goto('/founders')
    const display = await page
      .getByRole('heading', { level: 1 })
      .evaluate((heading) => getComputedStyle(heading).fontFamily)
    const figures = await page
      .locator('#story p span')
      .evaluateAll((spans) =>
        spans
          .filter((span) => span.textContent?.startsWith('₹'))
          .map((span) => [span.textContent ?? '', getComputedStyle(span).fontFamily]),
      )
    expect(figures.map(([text]) => text)).toEqual(['₹100 crore', '₹1000 crore'])
    for (const [, family] of figures) expect(family).toBe(display)
  })
})

test.describe('Without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  for (const path of NARRATIVE) {
    test(`${path} shows every heading and every chapter`, async ({ page }) => {
      await page.goto(path)
      // Every heading in the page, those a stylesheet might hide included.
      const headings = page.locator('main').locator('h1, h2, h3, h4')
      expect(await headings.count()).toBeGreaterThan(3)
      for (const heading of await headings.all()) await expect(heading).toBeVisible()
      for (const chapter of await chapters(page).all()) {
        await expect(chapter).toHaveCSS('opacity', '1')
      }
    })
  }

  test('/framework shows the plain table in place of the lines', async ({ page }) => {
    await page.goto('/framework')
    const table = page.getByRole('table')
    await expect(table).toBeVisible()
    await expect(table.getByRole('rowheader')).toHaveText(PAIRS.map((pair) => pair.object))
    await expect(table.getByRole('cell')).toHaveText(PAIRS.map((pair) => pair.subject))
    await expect(page.getByRole('button', { name: FLIP_COPY.flipAll })).toHaveCount(0)
    await expect(flipLines(page).first()).toBeHidden()
  })
})

test.describe('Under reduced motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  for (const path of NARRATIVE) {
    test(`the bar stands still at full width on ${path}`, async ({ page }) => {
      await page.goto(path)
      expect(await barShare(page)).toBeGreaterThan(0.99)
      await scrollToShare(page, 0.5)
      expect(await barShare(page)).toBeGreaterThan(0.99)
    })
  }

  test('a line turns at once, with no cross-fade', async ({ page }) => {
    await page.goto('/framework')
    const first = line(page, FIRST.object)
    await hydrated(first)
    const opacity = await first.evaluate(async (button) => {
      ;(button as HTMLButtonElement).click()
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const subject = button.querySelector('[data-face="subject"]') as HTMLElement
      return getComputedStyle(subject).opacity
    })
    expect(opacity).toBe('1')
  })

  test('no chapter is ever held back', async ({ page }) => {
    await page.goto('/founders')
    await hydrated(page.getByRole('link', { name: FOUNDERS_IIIC_LINES.begin }))
    for (const share of [0, 0.5, 1]) {
      await scrollToShare(page, share)
      for (const chapter of await chapters(page).all()) {
        await expect(chapter).toHaveAttribute('data-reveal', '')
        await expect(chapter).toHaveCSS('opacity', '1')
      }
    }
  })
})

test.describe('On paper', () => {
  test('the framework prints the table, and the founders’ page every chapter', async ({ page }) => {
    await page.emulateMedia({ media: 'print' })
    await page.goto('/framework')
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.getByRole('button', { name: FLIP_COPY.flipAll })).toHaveCount(0)
    await page.goto('/founders')
    await hydrated(page.getByRole('link', { name: FOUNDERS_IIIC_LINES.begin }))
    for (const chapter of await chapters(page).all()) {
      await expect(chapter).toHaveCSS('opacity', '1')
    }
  })
})

test.describe('Accessibility of the devices in use', () => {
  /** The serious and critical axe violations on the page as it stands. */
  async function blocking(page: Page): Promise<string[]> {
    const results = await new AxeBuilder({ page }).analyze()
    return results.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => violation.id)
  }

  test('the home page, read to its end', async ({ page }) => {
    await page.goto('/')
    await scrollToShare(page, 1)
    await expect.poll(() => barShare(page)).toBeGreaterThan(0.98)
    expect(await blocking(page)).toEqual([])
  })

  test('the framework page, every line turned and the table open', async ({ page }) => {
    await page.goto('/framework')
    const flipAll = page.getByRole('button', { name: FLIP_COPY.flipAll })
    await hydrated(flipAll)
    await flipAll.click()
    await page.getByRole('link', { name: FLIP_COPY.showBoth }).click()
    await expect(page.getByRole('table')).toBeVisible()
    expect(await blocking(page)).toEqual([])
  })

  test('the founders’ page, every chapter in and an insight marked', async ({ page }) => {
    await page.goto('/founders')
    await hydrated(page.getByRole('link', { name: FOUNDERS_IIIC_LINES.begin }))
    await readEveryChapter(page)
    expect(await blocking(page)).toEqual([])
  })
})

test.describe('No layout shift at 375 px (docs/11 §10)', () => {
  test.skip(({ isMobile }) => isMobile, 'Measured once, at 375 px, in the desktop project')

  for (const path of NARRATIVE) {
    test(`${path} shifts by no more than 0.05 from load to its end`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 })
      await page.addInitScript(() => {
        const scope = window as unknown as { shifted: number }
        scope.shifted = 0
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as (PerformanceEntry & {
            value: number
            hadRecentInput: boolean
          })[]) {
            if (!entry.hadRecentInput) scope.shifted += entry.value
          }
        }).observe({ type: 'layout-shift', buffered: true })
      })
      await page.goto(path)
      await hydrated(page.locator('header.iiic-header a').first())
      for (let step = 1; step <= 10; step += 1) {
        await scrollToShare(page, step / 10)
        await page.waitForTimeout(150)
      }
      const shifted = await page.evaluate(() => (window as unknown as { shifted: number }).shifted)
      expect(shifted).toBeLessThanOrEqual(0.05)
    })
  }
})
