// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { FEED_PATH } from '@/lib/journal/addresses'
import { FEED_SIZE, journalFeed } from '@/lib/journal/feed'
import type { IndexEntry } from '@/lib/journal/posts'
import { articleMetadata, FEED_TITLE, listMetadata } from '@/lib/journal/seo'
import { JOURNAL_PAGE } from '@/lib/seo/appPages'

// The Journal's RSS feed (src/lib/journal/feed.ts) and the link the Journal's pages carry to it.
// Every article is obviously fake.
const { journalIndex } = vi.hoisted(() => ({ journalIndex: vi.fn() }))
vi.mock('@/lib/journal/posts', () => ({ journalIndex }))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}))

const ORIGIN = 'https://fake.example'

const entry = (n: number, extra: Partial<IndexEntry> = {}): IndexEntry => ({
  slug: `fake-article-${n}`,
  title: `A fake question ${n} & more?`,
  excerpt: `A fake excerpt ${n}.`,
  searchTitle: null,
  description: null,
  publishedAt: `2026-11-${String(n).padStart(2, '0')}T08:30:00.000Z`,
  updatedAt: `2026-11-${String(n).padStart(2, '0')}T09:00:00.000Z`,
  ...extra,
})

const items = (xml: string) => xml.match(/<item>[\s\S]*?<\/item>/g) ?? []

describe('the Journal’s feed', () => {
  it('is RSS 2.0 for the Journal, with its title, description, language and own address', () => {
    const xml = journalFeed([entry(1)], ORIGIN)
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="utf-8"\?>/)
    expect(xml).toContain('<rss version="2.0"')
    expect(xml).toContain(`<title>${FEED_TITLE}</title>`)
    expect(xml).toContain(`<link>${ORIGIN}/journal</link>`)
    expect(xml).toContain(`<description>${JOURNAL_PAGE.description}</description>`)
    expect(xml).toContain('<language>en-IN</language>')
    expect(xml).toContain(`href="${ORIGIN}${FEED_PATH}"`)
    // No generator, no copyright line, no address of anyone's.
    expect(xml).not.toContain('<generator>')
    expect(xml).not.toContain('<copyright>')
    expect(xml).not.toContain('@')
  })

  it('lists each article, newest first, at its absolute address with its date', () => {
    const xml = journalFeed([entry(1), entry(3), entry(2)], ORIGIN)
    const found = items(xml)
    expect(found).toHaveLength(3)
    expect(found.map((item) => item.match(/<link>([^<]+)<\/link>/)?.[1])).toEqual([
      `${ORIGIN}/journal/fake-article-3`,
      `${ORIGIN}/journal/fake-article-2`,
      `${ORIGIN}/journal/fake-article-1`,
    ])
    expect(found[0]).toContain('<pubDate>Tue, 03 Nov 2026 08:30:00 GMT</pubDate>')
    // Its title kept as written inside CDATA, and its description: its own, else its excerpt.
    expect(found[0]).toContain('<title><![CDATA[A fake question 3 & more?]]></title>')
    expect(found[0]).toContain('A fake excerpt 3.')
    expect(xml).toContain('<lastBuildDate>Tue, 03 Nov 2026 09:00:00 GMT</lastBuildDate>')
    const described = journalFeed([entry(1, { description: 'A fake description.' })], ORIGIN)
    expect(described).toContain('A fake description.')
    expect(described).not.toContain('A fake excerpt 1.')
  })

  it('carries the newest articles only, and is a valid feed with none', () => {
    const many = Array.from({ length: FEED_SIZE + 5 }, (_, index) =>
      entry(1, { slug: `fake-article-x${index}` }),
    )
    expect(items(journalFeed(many, ORIGIN))).toHaveLength(FEED_SIZE)
    const empty = journalFeed([], ORIGIN)
    expect(items(empty)).toHaveLength(0)
    expect(empty).toContain('</channel>')
  })
})

describe('GET /journal/feed.xml', () => {
  it('serves the published articles as RSS, cached at the edge as llms.txt is, unindexed', async () => {
    journalIndex.mockResolvedValue({ posts: [entry(1)], topics: [] })
    const { GET } = await import('@/app/(platform)/(education)/journal/feed.xml/route')
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/rss+xml; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
    )
    expect(response.headers.get('x-robots-tag')).toBe('noindex')
    expect(await response.text()).toContain('/journal/fake-article-1</link>')
  })
})

describe('the Journal’s link to its feed', () => {
  const alternate = { 'application/rss+xml': [{ url: FEED_PATH, title: FEED_TITLE }] }

  it('is in the head of every list and every article, beside the canonical address', () => {
    for (const metadata of [listMetadata(null, 1), listMetadata(null, 2)]) {
      expect(metadata.alternates?.types).toEqual(alternate)
      expect(metadata.alternates?.canonical).toBeTruthy()
    }
    const topic = { id: 7, name: 'Fake topic', slug: 'fake-topic', door: 'framework' as const }
    expect(listMetadata(topic, 1).alternates?.types).toEqual(alternate)
    const article = articleMetadata({
      ...entry(1),
      id: 1,
      readingTime: 3,
      topics: [topic],
      body: null as never,
      question: 'What would a fake reader carry home?',
      author: 'founder',
      authorName: null,
    })
    expect(article.alternates?.types).toEqual(alternate)
    expect(String(article.alternates?.canonical)).toContain('/journal/fake-article-1')
  })
})
