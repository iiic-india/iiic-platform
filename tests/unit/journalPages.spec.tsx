// @vitest-environment node
import { buildEditorState } from '@payloadcms/richtext-lexical'
import type { Metadata } from 'next'
import { isValidElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import JournalArticlePage, {
  generateMetadata as articleMetadata,
} from '@/app/(platform)/(education)/journal/[slug]/page'
import JournalPage, {
  generateMetadata as journalMetadata,
} from '@/app/(platform)/(education)/journal/page'
import JournalLaterPage, {
  generateMetadata as laterMetadata,
} from '@/app/(platform)/(education)/journal/page/[number]/page'
import JournalTopicPage, {
  generateMetadata as topicMetadata,
} from '@/app/(platform)/(education)/journal/topic/[topic]/page'
import JournalTopicLaterPage, {
  generateMetadata as topicLaterMetadata,
} from '@/app/(platform)/(education)/journal/topic/[topic]/page/[number]/page'
import { Scope } from '@/components/blocks/PageBlocks'
import { LABEL, TakeItWithYou } from '@/components/experience/TakeItWithYou'
import { Article, QUESTION_HEADING } from '@/components/journal/Article'
import { JournalList } from '@/components/journal/JournalList'
import { CRISIS_HEADING, SCOPE_HEADING } from '@/lib/counselling/scope'
import { DOORS } from '@/lib/journal/doors'
import { getPost, getTopics, listPosts, type PostDetail } from '@/lib/journal/posts'
import { JOURNAL_PAGE } from '@/lib/seo/appPages'
import { FOUNDER } from '@/lib/seo/site'

// The Journal's routes (docs/02; docs/content/copy-architecture.md §4.8; docs/11 §3.6), each
// with its metadata and its page, in the education register their route group sets. The
// Journal's data is faked (src/lib/journal/posts.ts is tested on its own); the structured data
// is drawn as plain JSON so that the pages render in one pass. Every article, topic and name is
// obviously fake; the founder is the one recorded fact (D-64).
vi.mock('@/lib/journal/posts', () => ({
  getTopics: vi.fn(),
  listPosts: vi.fn(),
  getPost: vi.fn(),
}))
vi.mock('@/components/seo/JsonLd', async () => {
  const { createElement } = await import('react')
  return {
    JsonLd: ({ graph }: { graph: unknown }) =>
      createElement('script', {
        type: 'application/ld+json',
        dangerouslySetInnerHTML: { __html: JSON.stringify(graph) },
      }),
  }
})
// What a route answers where it has no page (src/lib/redirects/lookup.ts): no redirect here.
vi.mock('@/lib/redirects/lookup', () => ({
  redirectOrNotFound: vi.fn(async () => {
    throw new Error('fake not found')
  }),
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('fake not found')
  },
  permanentRedirect: (to: string) => {
    throw new Error(`fake permanent redirect to ${to}`)
  },
}))

const ORIGIN = 'https://fake.example'

const TOPIC = {
  id: 7,
  name: 'Fake topic',
  slug: 'fake-topic',
  door: 'framework' as const,
  description: 'A fake topic description.',
}
const COUNSELLING_TOPIC = {
  id: 8,
  name: 'Fake counselling topic',
  slug: 'fake-counselling',
  door: 'counselling' as const,
  description: null,
}

/** A published article by the founder. */
const POST: PostDetail = {
  id: 1,
  title: 'A fake question?',
  slug: 'fake-article',
  excerpt: 'A fake excerpt that answers the fake question.',
  publishedAt: '2026-11-21T08:30:00.000Z',
  updatedAt: '2026-11-22T09:00:00.000Z',
  readingTime: 3,
  topics: [TOPIC],
  body: buildEditorState({ text: 'Fake body words.' }) as PostDetail['body'],
  question: 'What would a fake reader carry home?',
  author: 'founder',
  authorName: null,
  searchTitle: null,
  description: null,
}

type Held = {
  topics?: (typeof TOPIC | typeof COUNSELLING_TOPIC)[]
  posts?: PostDetail[]
  totalPages?: number
}

/** What the fake Journal holds: the topics with an article, and the pages of its lists. */
function journalHolds({ topics = [], posts = [], totalPages }: Held = {}) {
  const pages = totalPages ?? (posts.length > 0 ? 1 : 0)
  vi.mocked(getTopics).mockResolvedValue(topics)
  vi.mocked(listPosts).mockImplementation(async (_topic, page) => ({
    docs: page <= pages ? posts : [],
    totalDocs: posts.length,
    totalPages: pages,
    page,
  }))
  vi.mocked(getPost).mockImplementation(
    async (slug) => posts.find((post) => post.slug === slug) ?? null,
  )
}

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) })

/** A list's page as the server draws it, the list itself awaited. */
async function drawList(page: ReactElement): Promise<string> {
  const { props } = page as ReactElement<Parameters<typeof JournalList>[0]>
  return renderToStaticMarkup(await JournalList(props))
}

/** The structured data a page carries, parsed. */
function graphOf(html: string): { '@type': string; [key: string]: unknown }[] {
  const json = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)?.[1] ?? ''
  return (JSON.parse(json) as { '@graph': { '@type': string }[] })['@graph']
}

const canonical = (metadata: Metadata) => metadata.alternates?.canonical

/** Whether a drawn element holds a component anywhere among its children, before rendering. */
function holds(node: unknown, component: unknown): boolean {
  if (Array.isArray(node)) return node.some((child) => holds(child, component))
  if (!isValidElement(node)) return false
  if (node.type === component) return true
  return holds((node.props as { children?: unknown }).children, component)
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', ORIGIN)
  vi.mocked(getTopics).mockReset()
  vi.mocked(listPosts).mockReset()
  vi.mocked(getPost).mockReset()
  journalHolds()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('/journal while no article is published (I-19)', () => {
  it('is the Journal, at its own canonical address', async () => {
    const metadata = await journalMetadata()
    expect(canonical(metadata)).toBe(`${ORIGIN}/journal`)
    expect(metadata.title).toBe(JOURNAL_PAGE.title)
    expect(metadata.description).toBe(JOURNAL_PAGE.description)
  })

  it('says honestly that there is nothing yet, and lists nothing', async () => {
    const html = await drawList(JournalPage())
    expect(html).toContain('<h1>The Journal</h1>')
    expect(html).toContain('<div class="iiic-empty"><h2>No articles yet</h2>')
    expect(html).toContain('will appear here once IIIC publishes them.')
    // No topics, no articles, no pages, and no placeholder: the empty state stands in for I-19.
    expect(html).not.toContain('aria-label="Topics"')
    expect(html).not.toContain('<ol')
    expect(html).not.toContain('iiic-pagination')
    expect(html).not.toMatch(/\[\[|TODO/)
  })

  it('carries its structured data: the page and the way down to it', async () => {
    const graph = graphOf(await drawList(JournalPage()))
    expect(graph.map((node) => node['@type'])).toEqual(['WebPage', 'BreadcrumbList'])
    expect(graph[0]).toMatchObject({ url: `${ORIGIN}/journal`, name: JOURNAL_PAGE.title })
  })
})

describe('/journal with articles', () => {
  beforeEach(() => {
    journalHolds({ topics: [TOPIC], posts: [POST], totalPages: 2 })
  })

  it('lists each article by its title, topic, excerpt, date and reading time', async () => {
    const html = await drawList(JournalPage())
    expect(html).toContain('<a href="/journal/fake-article">A fake question?</a>')
    expect(html).toContain('<div class="iiic-kicker">Fake topic</div>')
    expect(html).toContain(POST.excerpt)
    expect(html).toContain('<time dateTime="2026-11-21T08:30:00.000Z">21 November 2026</time>')
    expect(html).toContain('3 minutes to read')
    expect(vi.mocked(listPosts)).toHaveBeenCalledWith(null, 1)
  })

  it('filters by topic, the whole Journal marked as the current choice', async () => {
    const html = await drawList(JournalPage())
    expect(html).toContain('<nav aria-label="Topics">')
    expect(html).toContain('<a aria-current="true" href="/journal">All articles</a>')
    expect(html).toContain('<a href="/journal/topic/fake-topic">Fake topic</a>')
  })

  it('pages at clean addresses, each page named for a screen reader', async () => {
    const html = await drawList(JournalPage())
    expect(html).toContain('<nav aria-label="Pages"><ul class="iiic-pagination">')
    expect(html).toContain(
      '<span aria-current="page"><span class="iiic-sr-only">Page </span>1</span>',
    )
    expect(html).toContain('<a aria-label="Page 2" href="/journal/page/2">2</a>')
    expect(html).toContain(
      '<a rel="next" href="/journal/page/2">Older<span aria-hidden="true"> ›</span></a>',
    )
    expect(html).not.toContain('Newer')
  })

  it('shows a later page at its own address, which leads back to the newer one', async () => {
    const metadata = await laterMetadata(params({ number: '2' }))
    expect(canonical(metadata)).toBe(`${ORIGIN}/journal/page/2`)
    expect(metadata.title).toBe('The Journal, page 2')
    const html = await drawList(await JournalLaterPage(params({ number: '2' })))
    expect(html).toContain(
      '<a rel="prev" href="/journal"><span aria-hidden="true">‹ </span>Newer</a>',
    )
    expect(vi.mocked(listPosts)).toHaveBeenCalledWith(null, 2)
  })
})

describe('the Journal’s later pages', () => {
  it('send page 1 to the Journal itself, for good', async () => {
    await expect(JournalLaterPage(params({ number: '1' }))).rejects.toThrow(
      'fake permanent redirect to /journal',
    )
    await expect(
      JournalTopicLaterPage(params({ topic: 'fake-topic', number: '1' })),
    ).rejects.toThrow('fake permanent redirect to /journal/topic/fake-topic')
  })

  it('are the 404, with no canonical address, past the last page or at no page number', async () => {
    journalHolds({ topics: [TOPIC], posts: [POST], totalPages: 1 })
    for (const number of ['2', '0', '01', 'two', '1000']) {
      expect(await laterMetadata(params({ number })), number).toEqual({})
      const attempt = JournalLaterPage(params({ number })).then((page) => drawList(page))
      await expect(attempt, number).rejects.toThrow('fake not found')
    }
  })
})

describe('a topic', () => {
  beforeEach(() => {
    journalHolds({ topics: [TOPIC], posts: [POST], totalPages: 1 })
  })

  it('lists its own articles, under its name and the way back to the Journal', async () => {
    const metadata = await topicMetadata(params({ topic: 'fake-topic' }))
    expect(canonical(metadata)).toBe(`${ORIGIN}/journal/topic/fake-topic`)
    expect(metadata.title).toBe('The Journal: Fake topic')
    expect(metadata.description).toBe('A fake topic description.')
    const html = await drawList(await JournalTopicPage(params({ topic: 'fake-topic' })))
    expect(html).toContain('<h1>Fake topic</h1>')
    expect(html).toContain('A fake topic description.')
    expect(html).toContain(
      '<ol class="iiic-breadcrumb"><li><a href="/journal">Journal</a></li><li aria-current="page">Fake topic</li></ol>',
    )
    expect(html).toContain('<a aria-current="true" href="/journal/topic/fake-topic">Fake topic</a>')
    expect(vi.mocked(listPosts)).toHaveBeenCalledWith(7, 1)
    expect(html).not.toContain(SCOPE_HEADING)
  })

  it('ends with the scope statement and the crisis numbers where the topic leads to counselling', async () => {
    journalHolds({ topics: [TOPIC, COUNSELLING_TOPIC], posts: [POST], totalPages: 1 })
    const html = await drawList(await JournalTopicPage(params({ topic: 'fake-counselling' })))
    expect(html).toContain('<h1>Fake counselling topic</h1>')
    expect(html).toContain(renderToStaticMarkup(<Scope />))
    expect(html).toContain(CRISIS_HEADING)
    // The whole Journal, which lists every topic's articles, is not a counselling surface.
    expect(await drawList(JournalPage())).not.toContain(SCOPE_HEADING)
  })

  it('is the 404 where no topic holds a published article, or no topic could be', async () => {
    for (const topic of ['no-such-topic', 'Fake Topic', 'fake_topic']) {
      expect(await topicMetadata(params({ topic })), topic).toEqual({})
      const attempt = JournalTopicPage(params({ topic })).then((page) => drawList(page))
      await expect(attempt, topic).rejects.toThrow('fake not found')
    }
    expect(await topicLaterMetadata(params({ topic: 'no-such-topic', number: '2' }))).toEqual({})
  })
})

describe('an article', () => {
  beforeEach(() => {
    journalHolds({ topics: [TOPIC], posts: [POST], totalPages: 1 })
  })

  const draw = async (slug: string) =>
    renderToStaticMarkup(await JournalArticlePage(params({ slug })))

  it('is the 404, with no canonical address, where no article is published', async () => {
    for (const slug of ['no-such-article', 'page', 'Fake']) {
      expect(await articleMetadata(params({ slug })), slug).toEqual({})
      await expect(draw(slug), slug).rejects.toThrow('fake not found')
    }
  })

  it('is an article to search, at its own canonical address', async () => {
    const metadata = await articleMetadata(params({ slug: 'fake-article' }))
    expect(canonical(metadata)).toBe(`${ORIGIN}/journal/fake-article`)
    expect(metadata.title).toBe('A fake question?')
    expect((metadata.openGraph as { type?: string }).type).toBe('article')
  })

  it('carries its title, author, date and reading time, then its body', async () => {
    const html = await draw('fake-article')
    expect(html).toContain('<h1>A fake question?</h1>')
    expect(html).toContain(`<span>${FOUNDER.name}, founder</span>`)
    expect(html).toContain('<time dateTime="2026-11-21T08:30:00.000Z">21 November 2026</time>')
    expect(html).toContain('3 minutes to read')
    expect(html).toContain('<div class="iiic-article"><p>Fake body words.</p></div>')
    expect(html).toContain(
      '<ol class="iiic-breadcrumb"><li><a href="/journal">Journal</a></li><li><a href="/journal/topic/fake-topic">Fake topic</a></li><li aria-current="page">A fake question?</li></ol>',
    )
  })

  it('ends with its question in the kit’s panel, which stays on the page without JavaScript', async () => {
    const html = await draw('fake-article')
    expect(QUESTION_HEADING).toBe('A question to sit with')
    expect(html).toContain('<section class="iiic-panel')
    expect(html).toContain(`>${QUESTION_HEADING}</h2>`)
    expect(html).toContain(`${POST.question}</p>`)
    // The copy button exists only once the browser shows it can copy (tests/unit/takeItWithYou).
    expect(html).not.toContain(LABEL)
    expect(html.indexOf(POST.question)).toBeGreaterThan(html.indexOf('Fake body words.'))
  })

  it('then links to its first topic’s door, and offers nothing inside the text', async () => {
    const html = await draw('fake-article')
    expect(html).toContain(
      `<a class="iiic-btn iiic-btn-secondary" href="/framework">${DOORS.framework.link}</a>`,
    )
    expect(html.indexOf(DOORS.framework.link)).toBeGreaterThan(html.indexOf(POST.question))
    expect(html).not.toContain('iiic-bridge')
    expect(html).not.toContain(SCOPE_HEADING)
  })

  it('carries the counselling scope statement and the crisis numbers when it leads to counselling', async () => {
    const element = Article({ post: { ...POST, topics: [COUNSELLING_TOPIC] } }) as ReactElement
    const html = renderToStaticMarkup(element)
    expect(html).toContain(`href="/counselling">${DOORS.counselling.link}</a>`)
    expect(html).toContain(renderToStaticMarkup(<Scope />))
    expect(html).toContain(SCOPE_HEADING)
    expect(html).toContain(CRISIS_HEADING)
  })

  it('is a counselling surface when any of its topics leads to counselling: the statement, and no copy button', () => {
    const later = Article({ post: { ...POST, topics: [TOPIC, COUNSELLING_TOPIC] } }) as ReactElement
    const html = renderToStaticMarkup(later)
    // Its door is still its first topic's; the statement comes with the later topic.
    expect(html).toContain(`href="/framework">${DOORS.framework.link}</a>`)
    expect(html).toContain(SCOPE_HEADING)
    expect(html).toContain(CRISIS_HEADING)
    // No experience device on a counselling surface (docs/11 §2 item 6, §6): the question stays.
    expect(holds(later, TakeItWithYou)).toBe(false)
    expect(html).toContain(`${POST.question}</p>`)
    const first = Article({ post: { ...POST, topics: [COUNSELLING_TOPIC] } }) as ReactElement
    expect(holds(first, TakeItWithYou)).toBe(false)
  })

  it('offers the copy button, and no statement, where no topic leads to counselling', () => {
    const element = Article({ post: POST }) as ReactElement
    expect(holds(element, TakeItWithYou)).toBe(true)
    expect(renderToStaticMarkup(element)).not.toContain(SCOPE_HEADING)
  })

  it('carries its structured data: the page, the way down to it, the Article and its author', async () => {
    const graph = graphOf(await draw('fake-article'))
    expect(graph.map((node) => node['@type'])).toEqual([
      'WebPage',
      'BreadcrumbList',
      'Article',
      'Person',
    ])
    expect(graph[2]).toMatchObject({
      headline: 'A fake question?',
      datePublished: POST.publishedAt,
      dateModified: POST.updatedAt,
      author: { '@id': `${ORIGIN}/about#gaurang-mistry` },
      publisher: { '@id': `${ORIGIN}/#organization` },
    })
  })
})
