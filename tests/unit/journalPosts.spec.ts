// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POSTS_TAG, postTag, TOPICS_TAG } from '@/lib/content/revalidate'
import { PAGE_SIZE } from '@/lib/journal/addresses'
import { getPost, getTopics, journalIndex, listPosts } from '@/lib/journal/posts'

// What the Journal's pages read from the CMS (src/lib/journal/posts.ts), against a fake
// Payload: published articles only, read as a visitor reads them, each query with its depth and
// its fields named, and cached under the tags an editor's change marks stale. The cache
// records its key and options, and passes through. Every article and topic is obviously fake.
const { find, cacheCalls } = vi.hoisted(() => ({
  find: vi.fn(),
  cacheCalls: [] as unknown[][],
}))

vi.mock('server-only', () => ({}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => ({ find }) }))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: () => unknown, key: string[], options: unknown) => {
    cacheCalls.push([key, options])
    return fn
  },
}))

type Query = {
  collection: string
  where: Record<string, unknown>
  overrideAccess: boolean
  depth: number
  select: Record<string, boolean>
}

const TOPIC = { id: 7, name: 'Fake topic', slug: 'fake-topic', door: 'framework' as const }
const OTHER_TOPIC = { id: 8, name: 'Another fake topic', slug: 'another-fake-topic' }

/** A published article, as Payload returns it with its topics filled in. */
const ARTICLE = {
  id: 1,
  title: 'A fake question?',
  slug: 'fake-article',
  excerpt: 'A fake excerpt.',
  publishedAt: '2026-11-21T08:30:00.000Z',
  readingTime: 3,
  topics: [TOPIC],
}

const PUBLISHED = { _status: { equals: 'published' } }

const queries = () => find.mock.calls.map(([query]) => query as Query)

beforeEach(() => {
  cacheCalls.length = 0
  find.mockReset()
  find.mockImplementation(async ({ collection, depth }: Query) => {
    if (collection === 'topics') return { docs: [TOPIC] }
    // The topics of each published article, by id, when only they are asked for.
    if (depth === 0)
      return {
        docs: [
          { id: 1, topics: [7] },
          { id: 2, topics: [7] },
        ],
      }
    return { docs: [ARTICLE], totalDocs: 1, totalPages: 1, page: 1 }
  })
})

describe('every query the Journal makes', () => {
  it('reads as a visitor, published articles only, with its depth and fields named', async () => {
    await Promise.all([
      getTopics(),
      listPosts(null, 1),
      listPosts(7, 2),
      getPost('fake-article'),
      journalIndex(),
    ])
    expect(queries().length).toBeGreaterThan(0)
    for (const query of queries()) {
      expect(query.overrideAccess, JSON.stringify(query)).toBe(false)
      expect(typeof query.depth, JSON.stringify(query)).toBe('number')
      expect(Object.keys(query.select).length, JSON.stringify(query)).toBeGreaterThan(0)
      if (query.collection === 'posts') {
        expect(JSON.stringify(query.where), JSON.stringify(query)).toContain(
          JSON.stringify(PUBLISHED),
        )
      }
    }
  })
})

describe('the topics the Journal lists', () => {
  it('are the topics that hold a published article, by name', async () => {
    expect(await getTopics()).toEqual([TOPIC])
    const topics = queries().find(({ collection }) => collection === 'topics')
    expect(topics).toMatchObject({ where: { id: { in: [7] } }, sort: 'name', depth: 0 })
  })

  it('are none, without asking for any, while no article is published', async () => {
    find.mockResolvedValue({ docs: [] })
    expect(await getTopics()).toEqual([])
    expect(queries().map(({ collection }) => collection)).toEqual(['posts'])
  })

  it('are cached under the articles’ and the topics’ tags, and refreshed every ten minutes', async () => {
    await getTopics()
    expect(cacheCalls).toContainEqual([
      ['journal-topics'],
      { tags: [POSTS_TAG, TOPICS_TAG], revalidate: 600 },
    ])
  })
})

describe('a page of a list', () => {
  it('is ten articles, newest first, with their topics filled in with what the site shows', async () => {
    const list = await listPosts(null, 1)
    expect(list).toEqual({ docs: [ARTICLE], totalDocs: 1, totalPages: 1, page: 1 })
    expect(queries()[0]).toMatchObject({
      collection: 'posts',
      where: PUBLISHED,
      sort: ['-publishedAt', '-createdAt'],
      limit: PAGE_SIZE,
      page: 1,
      depth: 1,
      populate: { topics: { name: true, slug: true, door: true, description: true } },
    })
    expect(PAGE_SIZE).toBe(10)
  })

  it('of one topic holds only that topic’s articles', async () => {
    await listPosts(7, 2)
    expect(queries()[0]).toMatchObject({
      where: { and: [PUBLISHED, { topics: { in: [7] } }] },
      page: 2,
    })
  })

  it('drops a topic the reader cannot see, and keeps the others in their order', async () => {
    find.mockResolvedValue({
      docs: [{ ...ARTICLE, topics: [OTHER_TOPIC, 9, null, TOPIC] }],
      totalDocs: 1,
      totalPages: 1,
      page: 1,
    })
    const [post] = (await listPosts(null, 1)).docs
    expect(post?.topics).toEqual([OTHER_TOPIC, TOPIC])
  })

  it('is cached by its topic and its page, and refreshed every ten minutes', async () => {
    await listPosts(null, 1)
    await listPosts(7, 3)
    expect(cacheCalls).toEqual([
      [['journal-list', 'all', '1'], { tags: [POSTS_TAG, TOPICS_TAG], revalidate: 600 }],
      [['journal-list', '7', '3'], { tags: [POSTS_TAG, TOPICS_TAG], revalidate: 600 }],
    ])
  })
})

describe('an article', () => {
  it('is the published article at its address, with its body, question and author', async () => {
    expect(await getPost('fake-article')).toEqual(ARTICLE)
    const [query] = queries()
    expect(query).toMatchObject({
      collection: 'posts',
      where: { and: [PUBLISHED, { slug: { equals: 'fake-article' } }] },
      limit: 1,
      depth: 1,
    })
    expect(Object.keys(query?.select ?? {})).toEqual(
      expect.arrayContaining(['body', 'question', 'author', 'authorName', 'updatedAt']),
    )
  })

  it('is none where nothing is published, and never asked for at an address no article has', async () => {
    find.mockResolvedValue({ docs: [] })
    expect(await getPost('fake-draft')).toBeNull()
    find.mockClear()
    for (const slug of ['page', 'topic', 'Fake', 'fake/article', '']) {
      expect(await getPost(slug), slug).toBeNull()
    }
    expect(find).not.toHaveBeenCalled()
  })

  it('is cached under its own tag as well as the Journal’s', async () => {
    await getPost('fake-article')
    expect(cacheCalls).toEqual([
      [
        ['journal-post', 'fake-article'],
        { tags: [POSTS_TAG, TOPICS_TAG, postTag('fake-article')] },
      ],
    ])
  })
})

describe('the Journal’s index for the sitemap and llms.txt', () => {
  it('is every published article with its dates, newest first, and the topics that hold one', async () => {
    find.mockImplementation(async ({ collection, select }: Query) => {
      if (collection === 'topics') return { docs: [TOPIC] }
      if ('topics' in select) return { docs: [{ id: 1, topics: [7] }] }
      return {
        docs: [
          {
            id: 1,
            slug: 'fake-article',
            title: 'A fake question?',
            excerpt: 'A fake excerpt.',
            searchTitle: null,
            description: null,
            publishedAt: '2026-11-21T08:30:00.000Z',
            updatedAt: '2026-11-22T09:00:00.000Z',
          },
        ],
      }
    })
    expect(await journalIndex()).toEqual({
      posts: [
        {
          slug: 'fake-article',
          title: 'A fake question?',
          excerpt: 'A fake excerpt.',
          searchTitle: null,
          description: null,
          publishedAt: '2026-11-21T08:30:00.000Z',
          updatedAt: '2026-11-22T09:00:00.000Z',
        },
      ],
      topics: [TOPIC],
    })
    const index = queries().find(({ select }) => 'updatedAt' in select)
    expect(index).toMatchObject({
      sort: ['-publishedAt', '-createdAt'],
      limit: 1000,
      pagination: false,
      depth: 0,
    })
    expect(cacheCalls).toContainEqual([['journal-index'], { tags: [POSTS_TAG] }])
  })
})
