import AxeBuilder from '@axe-core/playwright'
import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test'

import { JOURNAL_TEASER_HEADING } from '../../src/components/blocks/PageBlocks'
import { COPIED, LABEL } from '../../src/components/experience/TakeItWithYou'
import { PREVIEW_COPY } from '../../src/components/site/previewCopy'
import { CRISIS_HEADING, SCOPE_HEADING } from '../../src/lib/counselling/scope'
import { JOURNAL_PAGE } from '../../src/lib/seo/appPages'
import { canonicalUrl, siteOrigin, TITLE_SUFFIX } from '../../src/lib/seo/site'
import { login, signIn } from '../helpers/login'
import { cleanupJournalEditor, journalEditor, seedJournalEditor } from '../helpers/seedUser'

// The Journal on the running site (docs/02; docs/content/copy-architecture.md §4.8). CI serves
// an empty, migrated database, so the Journal first shows its honest empty state (I-19), and
// every article and topic address is a 404 in the Journal's own register. The last group then
// publishes fake articles through the admin's API, reads them as a visitor, and removes them.
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

  test('the home page shows no Journal section while nothing is published', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: JOURNAL_TEASER_HEADING })).toHaveCount(0)
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
      await expect(page.getByText('404 · Page not found', { exact: true })).toBeVisible()
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

  test('the feed is valid RSS with no article, cached as llms.txt is (docs/12 §3)', async ({
    request,
  }) => {
    const response = await request.get('/journal/feed.xml')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('application/rss+xml; charset=utf-8')
    expect(response.headers()['cache-control']).toBe(
      'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
    )
    const xml = await response.text()
    expect(xml).toContain('<rss version="2.0"')
    expect(xml).not.toContain('<item>')
  })

  test('a visitor’s preview link is a plain 404 that sets no cookie (OS-4)', async ({
    request,
  }) => {
    for (const query of [
      'collection=posts&slug=no-such-article',
      'collection=pages&slug=framework',
    ]) {
      const response = await request.get(`/api/preview?${query}`, { maxRedirects: 0 })
      expect(response.status(), query).toBe(404)
      expect(response.headers()['set-cookie'], query).toBeUndefined()
    }
  })

  test('an article that is not published has no share image either', async ({ request }) => {
    expect((await request.get('/og/journal/no-such-article')).status()).toBe(404)
    expect((await request.get('/og/journal/topic/no-such-topic')).status()).toBe(404)
    const image = await request.get('/og/journal')
    expect(image.status()).toBe(200)
    expect(image.headers()['content-type']).toBe('image/png')
  })
})

/** The widths each page is loaded at: a small phone, a tablet, a wide desktop. */
const WIDTHS = [320, 768, 1600]

/** Two fake topics, one leading to counselling, and an article under each. */
const FAKE_TOPICS = [
  { name: 'Fake e2e topic', slug: 'fake-e2e-topic', door: 'framework' },
  { name: 'Fake e2e counselling', slug: 'fake-e2e-counselling', door: 'counselling' },
] as const
const FAKE_POSTS = [
  { title: 'A fake end-to-end question?', slug: 'fake-e2e-article', topic: 'fake-e2e-topic' },
  {
    title: 'A fake end-to-end counselling question?',
    slug: 'fake-e2e-counselling-article',
    topic: 'fake-e2e-counselling',
  },
] as const
const FAKE_QUESTION = 'What would a fake reader of this test carry home?'

/** A Lexical body of one fake paragraph, as the admin's editor saves it. */
const fakeBody = (words: string) => ({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr',
    children: [
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr',
        textFormat: 0,
        textStyle: '',
        children: [
          {
            type: 'text',
            text: words,
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
        ],
      },
    ],
  },
})

/** Payload reads the session cookie only when the request names an allowed origin. */
const asEditor = { headers: { Origin: ORIGIN } }

/** Removes the fake articles, then their topics, through the API, so the site's cache hears. */
async function removeFakes(api: APIRequestContext): Promise<void> {
  const posts = new URLSearchParams({
    'where[slug][in]': FAKE_POSTS.map((post) => post.slug).join(','),
  })
  const topics = new URLSearchParams({
    'where[slug][in]': FAKE_TOPICS.map((topic) => topic.slug).join(','),
  })
  expect((await api.delete(`/api/posts?${posts}`, asEditor)).ok()).toBe(true)
  expect((await api.delete(`/api/topics?${topics}`, asEditor)).ok()).toBe(true)
}

/** The header's bar (docs/11 §3.1): its one span, hidden from assistive technology. */
const barOn = (page: Page) => page.locator('header.iiic-header > span[aria-hidden="true"]')

/** A draft title saved over a published article, which only a preview shows. Obviously fake. */
const DRAFT_TITLE = 'A fake draft title, not yet published?'

/** Serious and critical axe findings on the page as it is now. */
async function blockingViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze()
  return results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => violation.id)
}

/** Loads a page as a visitor: it answers 200 and fits every width, then passes axe. */
async function checkPage(page: Page, path: string): Promise<void> {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })
    const response = await page.goto(path)
    expect(response?.status(), `${path} at ${width} px`).toBe(200)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow, `${path} at ${width} px`).toBeLessThanOrEqual(0)
  }
  expect(await blockingViolations(page), path).toEqual([])
  await expect(page.locator('.iiic-site')).toHaveAttribute('data-register', 'education')
}

test.describe('The Journal once articles are published', () => {
  test.describe.configure({ mode: 'serial' })
  // One project publishes and removes the fakes; each page is loaded at a phone's width too.
  test.skip(({ isMobile }) => isMobile, 'The desktop project publishes and checks the articles')

  let editorContext: BrowserContext | undefined
  let editor: Page
  const postIds: Record<string, number | string> = {}

  test.beforeAll(async ({ browser }, testInfo) => {
    if (testInfo.project.use.isMobile) return
    await seedJournalEditor()
    editorContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
    editor = await editorContext.newPage()
    await login(editor, journalEditor)
    // A retry starts clean: whatever an earlier attempt left goes first.
    await removeFakes(editor.request)
    const topicIds: Record<string, number | string> = {}
    for (const topic of FAKE_TOPICS) {
      const response = await editor.request.post('/api/topics', { ...asEditor, data: topic })
      expect(response.status(), topic.slug).toBe(201)
      topicIds[topic.slug] = ((await response.json()) as { doc: { id: number | string } }).doc.id
    }
    for (const post of FAKE_POSTS) {
      const response = await editor.request.post('/api/posts', {
        ...asEditor,
        data: {
          title: post.title,
          slug: post.slug,
          excerpt: 'A fake excerpt that answers the fake end-to-end question.',
          body: fakeBody('Fake body words for the end-to-end test.'),
          question: FAKE_QUESTION,
          topics: [topicIds[post.topic]],
          author: 'founder',
          _status: 'published',
        },
      })
      expect(response.status(), post.slug).toBe(201)
      postIds[post.slug] = ((await response.json()) as { doc: { id: number | string } }).doc.id
    }
  })

  test.afterAll(async ({ browser: _browser }, testInfo) => {
    if (testInfo.project.use.isMobile) return
    // Removed through the API, so the sitemap and llms.txt that seo.e2e reads are fresh again.
    if (editorContext) {
      await removeFakes(editor.request)
      await editorContext.close()
    }
    await cleanupJournalEditor()
  })

  test('the Journal lists the published articles and their topics', async ({ page }) => {
    await checkPage(page, '/journal')
    for (const post of FAKE_POSTS) {
      await expect(page.getByRole('link', { name: post.title, exact: true })).toBeVisible()
    }
    const topics = page.getByRole('navigation', { name: 'Topics' })
    for (const topic of FAKE_TOPICS) {
      await expect(topics.getByRole('link', { name: topic.name, exact: true })).toBeVisible()
    }
    // The whole Journal is not a counselling surface.
    await expect(page.getByText(SCOPE_HEADING)).toHaveCount(0)
  })

  test('a topic lists its own articles only', async ({ page }) => {
    await checkPage(page, '/journal/topic/fake-e2e-topic')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fake e2e topic')
    await expect(page.getByRole('link', { name: FAKE_POSTS[0].title, exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: FAKE_POSTS[1].title, exact: true })).toHaveCount(0)
    await expect(page.getByText(SCOPE_HEADING)).toHaveCount(0)
  })

  test('the counselling topic’s list ends with the scope statement and the crisis numbers', async ({
    page,
  }) => {
    await checkPage(page, '/journal/topic/fake-e2e-counselling')
    await expect(page.getByRole('heading', { name: SCOPE_HEADING })).toBeVisible()
    await expect(page.getByRole('heading', { name: CRISIS_HEADING })).toBeVisible()
  })

  test('an article reads in full, and its question copies under the nonce CSP', async ({
    page,
  }) => {
    const refused: string[] = []
    page.on('console', (message) => {
      if (/Content Security Policy/i.test(message.text())) refused.push(message.text())
    })
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await checkPage(page, '/journal/fake-e2e-article')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(FAKE_POSTS[0].title)
    await expect(page.getByText('Fake body words for the end-to-end test.')).toBeVisible()
    await expect(page.getByText(FAKE_QUESTION)).toBeVisible()
    await expect(page.getByText(SCOPE_HEADING)).toHaveCount(0)
    // The button exists only once the page has hydrated, which the CSP's nonce allows.
    await page.getByRole('button', { name: LABEL }).click()
    await expect(page.getByRole('button', { name: COPIED })).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(FAKE_QUESTION)
    expect(refused).toEqual([])
  })

  test('an article under a counselling topic carries the statement and no copy button', async ({
    page,
  }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await checkPage(page, '/journal/fake-e2e-counselling-article')
    await expect(page.getByRole('heading', { name: SCOPE_HEADING })).toBeVisible()
    await expect(page.getByRole('heading', { name: CRISIS_HEADING })).toBeVisible()
    await expect(page.getByText(FAKE_QUESTION)).toBeVisible()
    await expect(page.getByRole('button', { name: LABEL })).toHaveCount(0)
  })

  test('the bar tracks the reader of an article, and never of one that leads to counselling', async ({
    page,
  }) => {
    await page.goto('/journal/fake-e2e-article')
    await expect(barOn(page)).toHaveCount(1)
    await expect(barOn(page)).toHaveCSS('display', 'block')
    await page.goto('/journal/fake-e2e-counselling-article')
    await expect(barOn(page)).not.toHaveCSS('display', 'block')
    // Moving from one to the other inside the site keeps to each article's own rule.
    await page.goto('/journal/fake-e2e-article')
    await page.getByRole('link', { name: 'Journal', exact: true }).first().click()
    await page.getByRole('link', { name: FAKE_POSTS[1].title, exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(FAKE_POSTS[1].title)
    await expect(barOn(page)).not.toHaveCSS('display', 'block')
  })

  test('the feed lists the published articles at their absolute addresses', async ({ page }) => {
    const response = await page.request.get('/journal/feed.xml')
    expect(response.status()).toBe(200)
    const xml = await response.text()
    for (const post of FAKE_POSTS) {
      expect(xml).toContain(`<link>${canonicalUrl(`/journal/${post.slug}`, ORIGIN)}</link>`)
    }
    expect(xml).toContain('<pubDate>')
    // Every page of the Journal points feed readers at it.
    for (const path of ['/journal', '/journal/topic/fake-e2e-topic', '/journal/fake-e2e-article']) {
      await page.goto(path)
      const link = page.locator('link[rel="alternate"][type="application/rss+xml"]')
      await expect(link, path).toHaveCount(1)
      expect(new URL((await link.getAttribute('href')) ?? '', ORIGIN).pathname, path).toBe(
        '/journal/feed.xml',
      )
    }
  })

  test('the home page shows the newest articles before its closing band', async ({ page }) => {
    await page.goto('/')
    const section = page.locator('section', {
      has: page.getByRole('heading', { name: JOURNAL_TEASER_HEADING }),
    })
    await expect(section).toBeVisible()
    for (const post of FAKE_POSTS) {
      await expect(section.getByRole('link', { name: post.title, exact: true })).toHaveAttribute(
        'href',
        `/journal/${post.slug}`,
      )
    }
    expect(await blockingViolations(page)).toEqual([])
  })

  test('an unpublished article leaves the site at the next request', async ({ page }) => {
    const response = await editor.request.patch(`/api/posts/${postIds['fake-e2e-article']}`, {
      ...asEditor,
      data: { _status: 'draft' },
    })
    expect(response.ok()).toBe(true)
    expect((await page.goto('/journal/fake-e2e-article'))?.status()).toBe(404)
    await page.goto('/journal')
    await expect(page.getByRole('link', { name: FAKE_POSTS[0].title, exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: FAKE_POSTS[1].title, exact: true })).toBeVisible()
  })

  // The live preview (docs/15 §5.3, OS-4). The first article is a draft now, and the second gets
  // a draft title saved over its published version.
  const previewLink = (slug: string) => `/api/preview?collection=posts&slug=${slug}`

  test('staff with their code see the draft as the site draws it, framed by the admin', async () => {
    const saved = await editor.request.patch(
      `/api/posts/${postIds['fake-e2e-counselling-article']}?draft=true`,
      { ...asEditor, data: { title: DRAFT_TITLE } },
    )
    expect(saved.ok()).toBe(true)

    const opened = await editor.goto(previewLink('fake-e2e-article'))
    expect(opened?.status()).toBe(200)
    expect(new URL(editor.url()).pathname).toBe('/journal/fake-e2e-article')
    await expect(editor.getByRole('heading', { level: 1 })).toHaveText(FAKE_POSTS[0].title)
    await expect(editor.locator('.iiic-site')).toHaveAttribute('data-register', 'education')
    await expect(editor.getByRole('status').filter({ hasText: PREVIEW_COPY.line })).toBeVisible()
    // Only this response may be framed, by the admin on the same origin, and it is never indexed.
    const headers = opened?.headers() ?? {}
    expect(headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(headers['content-security-policy']).toContain("frame-ancestors 'self'")
    expect(headers['x-robots-tag']).toContain('noindex')
    // The draft-mode cookie (docs/12 §10): a session cookie, HttpOnly, beside the staff session's two.
    const cookies = await editor.context().cookies()
    expect(cookies.map((cookie) => cookie.name).sort()).toEqual([
      '__prerender_bypass',
      'payload-token',
      'payload-totp',
    ])
    expect(cookies.find((cookie) => cookie.name === '__prerender_bypass')).toMatchObject({
      httpOnly: true,
      expires: -1,
    })

    // A draft saved over a published article shows in the preview, the published one elsewhere.
    await editor.goto(previewLink('fake-e2e-counselling-article'))
    await expect(editor.getByRole('heading', { level: 1 })).toHaveText(DRAFT_TITLE)
    // Still a counselling surface: no bar, the scope statement.
    await expect(barOn(editor)).not.toHaveCSS('display', 'block')
    await expect(editor.getByRole('heading', { name: SCOPE_HEADING })).toBeVisible()

    // The admin frames the draft, as its live preview does.
    await editor.goto('/admin')
    const framed = await editor.evaluate(async (path) => {
      const frame = document.createElement('iframe')
      frame.src = path
      const loaded = new Promise((resolve) => frame.addEventListener('load', resolve))
      document.body.append(frame)
      await loaded
      try {
        return frame.contentDocument?.querySelector('h1')?.textContent ?? null
      } catch {
        return null
      }
    }, '/journal/fake-e2e-article')
    expect(framed).toBe(FAKE_POSTS[0].title)
  })

  test('a visitor, or staff without their code, get the published page or the 404, never a draft', async ({
    page,
    browser,
  }, testInfo) => {
    const draftCookie = (await editor.context().cookies()).find(
      (cookie) => cookie.name === '__prerender_bypass',
    )
    expect(draftCookie).toBeDefined()
    if (!draftCookie) return

    /** What a browser holding the draft-mode cookie is shown at the two addresses. */
    const expectPublishedOnly = async (viewer: Page) => {
      expect((await viewer.goto('/journal/fake-e2e-article'))?.status()).toBe(404)
      const published = await viewer.goto('/journal/fake-e2e-counselling-article')
      expect(published?.status()).toBe(200)
      await expect(viewer.getByRole('heading', { level: 1 })).toHaveText(FAKE_POSTS[1].title)
      await expect(viewer.getByText(PREVIEW_COPY.line)).toHaveCount(0)
      expect(published?.headers()['x-frame-options']).toBe('DENY')
      expect(published?.headers()['content-security-policy']).toContain("frame-ancestors 'none'")
    }

    // A visitor: the preview link refuses them, and the cookie, should they hold it, shows nothing.
    expect((await page.goto(previewLink('fake-e2e-article')))?.status()).toBe(404)
    expect(await page.context().cookies()).toEqual([])
    await page.context().addCookies([draftCookie])
    await expectPublishedOnly(page)

    // Staff signed in who have not entered their code.
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
    try {
      const uncoded = await context.newPage()
      await signIn(uncoded, { email: journalEditor.email, password: journalEditor.password })
      await uncoded.waitForURL(/\/admin\/verify-totp/)
      expect((await uncoded.goto(previewLink('fake-e2e-article')))?.status()).toBe(404)
      expect((await context.cookies()).map((cookie) => cookie.name)).not.toContain(
        '__prerender_bypass',
      )
      await context.addCookies([draftCookie])
      await expectPublishedOnly(uncoded)
    } finally {
      await context.close()
    }
  })

  test('leaving preview clears its cookie and shows the published page again', async () => {
    await editor.goto('/journal/fake-e2e-counselling-article')
    await expect(editor.getByRole('heading', { level: 1 })).toHaveText(DRAFT_TITLE)
    await editor.getByRole('link', { name: PREVIEW_COPY.leave }).click()
    await expect(editor).toHaveURL(/\/journal\/fake-e2e-counselling-article$/)
    await expect(editor.getByRole('heading', { level: 1 })).toHaveText(FAKE_POSTS[1].title)
    await expect(editor.getByText(PREVIEW_COPY.line)).toHaveCount(0)
    expect((await editor.context().cookies()).map((cookie) => cookie.name)).not.toContain(
      '__prerender_bypass',
    )
  })
})
