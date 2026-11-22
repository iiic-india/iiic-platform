import AxeBuilder from '@axe-core/playwright'
import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test'

import { COPIED, LABEL } from '../../src/components/experience/TakeItWithYou'
import { CRISIS_HEADING, SCOPE_HEADING } from '../../src/lib/counselling/scope'
import { JOURNAL_PAGE } from '../../src/lib/seo/appPages'
import { canonicalUrl, siteOrigin, TITLE_SUFFIX } from '../../src/lib/seo/site'
import { login } from '../helpers/login'
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
})
