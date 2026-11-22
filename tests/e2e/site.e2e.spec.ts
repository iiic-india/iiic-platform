import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { STARTER_PAGES } from '../../src/content/starter'
import { pagePath } from '../../src/lib/content/slug'
import { CONSULTANCY_SERVICES, TEAM_MAP } from '../../src/lib/site/consultancy'

// Every page the site shows, the 404 in each register included: the accessibility page says
// each has passed these checks. The starter pages are the pages built so far (docs/02), /map
// asks Find your path's question, /journal is the Journal and /proof is Proof, both empty in
// CI's database. The 404 is what links to pages not built yet (the footer's Verify a
// certificate) reach today;
// on a counselling path, where "Book a session" leads for now, it carries the scope statement
// and the crisis numbers (docs/11 §5.1, item 8). Under /institute/, /organisations/,
// /counselling/ and /journal/ it takes that section's register (docs/02).
const PAGES = [
  ...Object.keys(STARTER_PAGES).map(pagePath),
  '/map',
  '/journal',
  '/proof',
  '/journal/no-such-article',
  '/no-such-page',
  '/book/session',
  '/institute/verify',
  '/organisations/no-such-page',
  '/counselling/no-such-page',
]

/** The widths the overflow check loads each page at: a small phone, a tablet, a wide desktop. */
const WIDTHS = [320, 768, 1600]

/** The WCAG contrast ratio of two colours as a browser computes them, such as "rgb(28, 38, 43)". */
function contrast(...colours: string[]): number {
  const [first = 0, second = 0] = colours.map((colour) => {
    const [r = 0, g = 0, b = 0] = (colour.match(/[\d.]+/g) ?? []).map((part) => {
      const channel = Number(part) / 255
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  })
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

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

  test('a placeholder in the hero’s main button stays readable on its yellow', async ({ page }) => {
    await page.goto('/')
    // No starter page has one, but a page published in the admin may. The chip is drawn there
    // as the site draws a placeholder (src/components/Todo.tsx), its colours read, and the chip
    // removed in one step, so the page's own rendering never meets it.
    const colours = await page
      .locator('.iiic-hero .iiic-btn-primary')
      .first()
      .evaluate((button) => {
        const chip = document.createElement('span')
        chip.className = 'iiic-todo'
        chip.textContent = '[[TODO: fake button words, I-41]]'
        button.append(chip)
        const read = [getComputedStyle(chip).color, getComputedStyle(button).backgroundColor]
        chip.remove()
        return read
      })
    // WCAG 1.4.3: small text at 4.5:1 or more.
    expect(contrast(...colours), colours.join(' on ')).toBeGreaterThanOrEqual(4.5)
  })

  for (const path of PAGES) {
    test(`no horizontal scroll at ${WIDTHS.join(', ')} px on ${path}`, async ({ page }) => {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(path)
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        )
        expect(overflow, `${width} px`).toBeLessThanOrEqual(0)
      }
    })
  }

  test('Find your path asks one question and takes the visitor to their door', async ({ page }) => {
    await page.goto('/')
    // The hero button; the header has the same link, behind the menu on a phone.
    await page.locator('main').getByRole('link', { name: 'Find your path' }).first().click()
    await expect(page).toHaveURL(/\/map$/)
    await expect(page).toHaveTitle('Find your path · IIIC')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Who is this for?')
    // docs/03 F1: nothing is chosen for the visitor.
    const answers = page.getByRole('group', { name: 'Who is this for?' }).getByRole('radio')
    await expect(answers).toHaveCount(3)
    for (const answer of await answers.all()) await expect(answer).not.toBeChecked()
    await page.getByRole('radio', { name: 'Your organisation' }).check()
    await page.getByRole('button', { name: 'Continue' }).click()
    // docs/03 F1: an organisation's door is the Team Map.
    await expect(page).toHaveURL(/\/organisations\/team-map$/)
    await expect(page.locator('.iiic-site')).toHaveAttribute('data-register', 'consultancy')
  })

  test('Find your path sends an unknown answer, or one in the address, back to the question', async ({
    page,
  }) => {
    const response = await page.request.post('/map/go', {
      form: { who: 'everyone' },
      maxRedirects: 0,
    })
    expect(response.status()).toBe(303)
    expect(response.headers()['location']).toBe('/map')
    // The answer is posted, never put in an address, which the request log keeps.
    await page.goto('/map/go?who=yourself')
    await expect(page).toHaveURL(/\/map$/)
  })

  test('the learn page: IIIC’s five pillars, and a certificate that is not a degree', async ({
    page,
  }) => {
    const response = await page.goto('/learn')
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle('Subjective Self certification course · IIIC')
    await expect(page.locator('.iiic-site')).toHaveAttribute('data-register', 'education')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Education That Teaches the Why.',
    )
    await expect(page.locator('.iiic-grid > .iiic-card h3')).toHaveText([
      'Purpose',
      'Identity',
      'Significance',
      'Logic',
      'Accountability',
    ])
    // docs/08 §7: the fixed statement, on the course page.
    await expect(page.locator('#certificate')).toContainText('Not a degree or diploma')
    await expect(page.locator('main')).not.toContainText(/₹|Rs\.?\s?\d/)
  })

  test('the about page: IIIC in its own words, and the contact section the footer opens', async ({
    page,
  }) => {
    const response = await page.goto('/about')
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle('Indian Institute of Image Catalysts, Ahmedabad · IIIC')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Indian Institute of Image Catalysts',
    )
    // The footer's Contact link opens the section, with the details the footer gives (D-31).
    await page.locator('footer').getByRole('link', { name: 'Contact', exact: true }).click()
    await expect(page).toHaveURL(/\/about#contact$/)
    const contact = page.locator('#contact')
    await expect(contact).toBeInViewport()
    await expect(contact.getByRole('link', { name: '+91 96240 46464' })).toHaveAttribute(
      'href',
      'tel:+919624046464',
    )
    await expect(contact.locator('.iiic-todo')).toHaveAttribute('data-todo', 'I-33')
    await expect(page.locator('main')).not.toContainText(/₹|Rs\.?\s?\d/)
  })

  test('the founders’ page: IIIC’s narrative, labelled as an illustration', async ({ page }) => {
    const response = await page.goto('/founders')
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle('Consultancy for founders & business owners, Ahmedabad · IIIC')
    await expect(page.locator('.iiic-site')).toHaveAttribute('data-register', 'consultancy')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'From ₹100 Crore to ₹1000 Crore, the Journey Begins Within',
    )
    // The hero's button leads into the story, and the story says what it is (D-28).
    await page.getByRole('link', { name: 'Begin Your Journey' }).click()
    await expect(page).toHaveURL(/\/founders#story$/)
    const story = page.locator('#story')
    await expect(story).toBeInViewport()
    // After the chapter's kicker, a placeholder until IIIC approves its words (docs/11 §3.5).
    const kicker = story.locator('.iiic-kicker')
    await expect(kicker).toHaveText(/ · IIIC’s illustration, not a client’s story$/)
    await expect(kicker.locator('.iiic-todo')).toHaveAttribute('data-todo', 'I-41')
    // I-36: the supplied label, on the proposal call.
    await expect(page.getByRole('link', { name: 'Book a Founder Consultation' })).toHaveAttribute(
      'href',
      '/book/call',
    )
    await expect(page.locator('.iiic-band [lang="sa"]')).toHaveText('आत्मानं विद्धि')
  })

  test('the institute page: the plan’s sections, one partnership as it happened', async ({
    page,
  }) => {
    const response = await page.goto('/institute')
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle('Subjective Self research and university partnership · IIIC')
    await expect(page.locator('.iiic-site')).toHaveAttribute('data-register', 'education')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Research, programmes and partnerships',
    )
    await expect(page.locator('main h2')).toHaveText([
      'Framework and research',
      'Programmes',
      'The certificate',
      'Partnerships',
      'Faculty',
      'Verify a certificate',
    ])
    // docs/08 §7: the fixed statement, wherever certificates are described.
    await expect(page.locator('#certificate')).toContainText('Not a degree or diploma')
    await expect(page.locator('main')).toContainText('Pandit Deendayal Energy University')
    await expect(page.locator('main')).not.toContainText(/₹|Rs\.?\s?\d/)
  })

  test('the legal pages are drafts and say so; the accessibility page is IIIC’s own', async ({
    page,
  }) => {
    const legal = [
      ['/legal', 'Legal information'],
      ['/privacy', 'Privacy notice'],
      ['/terms', 'Terms of use'],
      ['/refunds', 'Cancellations and refunds'],
      ['/grievance', 'Grievance officer'],
    ] as const
    for (const [path, heading] of legal) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(200)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading)
      // D-52: a draft until the lawyer has reviewed it (I-22).
      await expect(page.locator('.iiic-hero [data-draft="I-22"]')).toHaveText(
        'Draft page, awaiting legal review (I-22)',
      )
      await expect(page.locator('main')).not.toContainText(/₹|Rs\.?\s?\d/)
    }
    await page.goto('/privacy')
    await page.locator('footer').getByRole('link', { name: 'Accessibility' }).click()
    await expect(page).toHaveURL(/\/accessibility$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Accessibility')
    await expect(page.locator('[data-draft]')).toHaveCount(0)
  })

  test('the counselling page carries the scope statement and the crisis numbers', async ({
    page,
  }) => {
    const response = await page.goto('/counselling')
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle('Counselling in Ahmedabad for individuals & families · IIIC')
    await expect(page.locator('.iiic-site')).toHaveAttribute('data-register', 'counselling')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Be Heard. Be Understood. Know Yourself.',
    )
    // docs/08 §7: non-clinical, not an emergency service, and where to call instead.
    const scope = page.locator('#scope')
    await expect(scope).toContainText('non-clinical conversations')
    await expect(scope).toContainText('not an emergency service')
    // Confidentiality and its legal limit, in VOICE.md's words ("Counselling copy").
    await expect(scope).toContainText('mandatory reporting')
    await expect(scope.getByRole('link', { name: '14416' })).toHaveAttribute('href', 'tel:14416')
    await expect(scope.getByRole('link', { name: '1-800-891-4416' })).toHaveAttribute(
      'href',
      'tel:18008914416',
    )
    await expect(scope.getByRole('link', { name: '112' })).toHaveAttribute('href', 'tel:112')
    await expect(scope.getByRole('link', { name: '1098' })).toHaveAttribute('href', 'tel:1098')
    // The hero points at the statement instead of promising confidentiality outright.
    await page.getByRole('link', { name: 'What a session is, and what we keep private' }).click()
    await expect(page).toHaveURL(/\/counselling#scope$/)
    // No price while prices are unpublished (D-21).
    await expect(page.locator('main')).not.toContainText(/₹|Rs\.?\s?\d/)
  })

  test('the organisations page speaks in the consultancy register, in IIIC’s words', async ({
    page,
  }) => {
    const response = await page.goto('/organisations')
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle('Business & management consultancy in Ahmedabad · IIIC')
    // docs/02: the consultancy register, set on the frame around header, page and footer.
    await expect(page.locator('.iiic-site')).toHaveAttribute('data-register', 'consultancy')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Your Business Grows as Far as Your Thinking Goes.',
    )
    await expect(
      page.getByText(
        "We don't just build businesses; we build the people, systems and cultures that make businesses sustainable.",
      ),
    ).toBeVisible()
    // The three organisational pillars, then the three services (I-11).
    await expect(page.locator('.iiic-grid > .iiic-card h3')).toHaveText([
      'People',
      'Processes',
      'Culture',
      'Organisation planning',
      'Marketing and sales',
      'Brand positioning',
    ])
    await expect(page.locator('.iiic-band-yellow')).toHaveCount(1)
  })

  // docs/02: a landing page for each of the three services docs/09 names, and the Team Map, in
  // the consultancy register, each with its search title, its own canonical URL and its Service
  // (D-62, D-65).
  for (const { slug, name } of [...CONSULTANCY_SERVICES, TEAM_MAP]) {
    test(`/${slug} is the consultancy’s page for ${name}`, async ({ page }) => {
      const response = await page.goto(`/${slug}`)
      expect(response?.status()).toBe(200)
      await expect(page).toHaveTitle(`${STARTER_PAGES[slug]?.title} · IIIC`)
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href')
      expect(new URL(canonical ?? '').pathname).toBe(`/${slug}`)
      await expect(page.locator('.iiic-site')).toHaveAttribute('data-register', 'consultancy')
      const data = (await page.locator('script[type="application/ld+json"]').textContent()) ?? ''
      const graph = (JSON.parse(data) as { '@graph': Record<string, unknown>[] })['@graph']
      const services = graph.filter((node) => node['@type'] === 'Service')
      expect(services).toHaveLength(1)
      expect(services[0]).toMatchObject({ name, audience: { '@type': 'BusinessAudience' } })
      expect(data).not.toMatch(/"offers"|"price/)
      // No price while prices are unpublished (D-21); a FAQPage only around questions shown.
      await expect(page.locator('main')).not.toContainText(/₹|Rs\.?\s?\d/)
      const shown = await page.locator('main details.iiic-accordion').count()
      expect(graph.filter((node) => node['@type'] === 'FAQPage')).toHaveLength(shown > 0 ? 1 : 0)
      await expect(page.locator('.iiic-band-yellow')).toHaveCount(1)
    })
  }

  test('the organisations page opens each service’s page and the Team Map', async ({ page }) => {
    await page.goto('/organisations')
    for (const { slug } of [...CONSULTANCY_SERVICES, TEAM_MAP]) {
      await expect(page.locator(`main a[href="/${slug}"]`).first()).toBeVisible()
    }
  })

  test('the framework page: the comparison’s table, IIIC’s lines, one closing band', async ({
    page,
  }) => {
    const response = await page.goto('/framework')
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle('Subjective Self, an Indian framework of psychology · IIIC')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'You Are the Subject of Your Life.',
    )
    // docs/11 §3.2: the lines flip (tests/e2e/experience.e2e.spec.ts); "Show both" opens the plain
    // two-column view, five pairs, each column named and each row headed by its first line, so
    // a screen reader reads every pair together. It is opened from the keyboard: after a click
    // on a link whose target cannot take focus, Chromium treats a later focus as a pointer one.
    await page.getByRole('link', { name: 'Show both' }).press('Enter')
    const comparison = page.getByRole('table')
    await expect(comparison.getByRole('columnheader')).toHaveText([
      'Living as the object',
      'Living as the subject',
    ])
    await expect(comparison.locator('tbody tr')).toHaveCount(5)
    await expect(comparison.getByRole('rowheader')).toHaveText([
      'Life happens to me',
      'I react to people and events',
      'Others decide my worth',
      'I follow instructions',
      'Circumstances drive my choices',
    ])
    // The table's scroll region takes keyboard focus and shows the kit's ring. The table was
    // opened from the keyboard, so the browser treats this focus as a keyboard one
    // (:focus-visible).
    const region = page.getByRole('region', { name: 'Object or subject?' })
    await region.focus()
    expect(await region.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none')
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

  // "constructor" is a name every JavaScript object inherits; it is no more a page than any other.
  for (const path of ['/no-such-page', '/constructor']) {
    test(`an unknown address gets the site’s own 404 inside the shell: ${path}`, async ({
      page,
    }) => {
      const response = await page.goto(path)
      expect(response?.status()).toBe(404)
      await expect(page.locator('html')).toHaveAttribute('lang', 'en-IN')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found')
      await expect(page.locator('footer')).toContainText('+91 96240 46464')
      // Only a counselling path carries the scope statement.
      await expect(page.locator('#scope')).toHaveCount(0)
    })
  }

  test('a broken counselling link gets the 404 with the scope statement and the crisis numbers', async ({
    page,
  }) => {
    // docs/11 §5.1, item 8: "Book a session" leads here until the booking flow is built.
    const response = await page.goto('/book/session')
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found')
    const scope = page.locator('#scope')
    await expect(scope).toContainText('not an emergency service')
    await expect(scope.getByRole('link', { name: '14416' })).toHaveAttribute('href', 'tel:14416')
    await expect(scope.getByRole('link', { name: '1098' })).toHaveAttribute('href', 'tel:1098')
    // The info session is booked in the education register: not a counselling path.
    expect((await page.goto('/book/info'))?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found')
    await expect(page.locator('#scope')).toHaveCount(0)
  })

  // docs/02: the pages under /institute/, /organisations/ and /counselling/ are in their
  // section's register, and so is the 404 for an address there that has no page.
  for (const [path, register] of [
    ['/institute', 'education'],
    ['/organisations', 'consultancy'],
    ['/counselling', 'counselling'],
  ] as const) {
    test(`an unknown address under ${path}/ gets the 404 in the ${register} register`, async ({
      page,
    }) => {
      const response = await page.goto(`${path}/no-such-page`)
      expect(response?.status()).toBe(404)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found')
      await expect(page.locator('.iiic-site')).toHaveAttribute('data-register', register)
      await expect(page.locator('footer')).toContainText('+91 96240 46464')
      // Only under /counselling/ does the 404 carry the scope statement and the crisis numbers.
      const scope = page.locator('#scope')
      if (register === 'counselling') {
        await expect(scope).toContainText('not an emergency service')
        await expect(scope.getByRole('link', { name: '14416' })).toHaveAttribute(
          'href',
          'tel:14416',
        )
      } else {
        await expect(scope).toHaveCount(0)
      }
      // The section's own page still answers.
      expect((await page.goto(path))?.status()).toBe(200)
      await expect(page.locator('.iiic-site')).toHaveAttribute('data-register', register)
    })
  }

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
