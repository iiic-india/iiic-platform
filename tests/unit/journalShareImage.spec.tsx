// @vitest-environment node
import { buildEditorState } from '@payloadcms/richtext-lexical'
import sharp from 'sharp'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/og/[...slug]/route'
import { getPost, getTopics, listPosts, type PostDetail } from '@/lib/journal/posts'
import { AUTHOR_NAME_MAX } from '@/lib/journal/rules'
import { articleMetadata } from '@/lib/journal/seo'
import { JOURNAL_PAGE } from '@/lib/seo/appPages'
import { SHARE_IMAGE_SIZE } from '@/lib/seo/metadata'
import {
  SHARE_IMAGE_BYLINE_MAX,
  shareImage,
  shareImageByline,
  type ShareImageInput,
} from '@/lib/seo/shareImage'
import { FOUNDER } from '@/lib/seo/site'

// The Journal's share images (docs/12 §3: article images show the title and the author's
// name), at the addresses its metadata gives them, with the network shut: every fetch fails,
// and is recorded. The Journal's data is faked; every article and topic is obviously fake.
vi.mock('server-only', () => ({}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => ({ find: vi.fn(), count: vi.fn() }) }))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: () => unknown) => fn }))
// In a test no one previews, so an article's route draws what getPost finds.
vi.mock('@/lib/journal/posts', () => {
  const getPost = vi.fn()
  return {
    getTopics: vi.fn(),
    listPosts: vi.fn(),
    getPost,
    getPostToShow: (slug: string) => getPost(slug),
  }
})

const fetchSpy = vi
  .spyOn(globalThis, 'fetch')
  .mockRejectedValue(new Error('the share image must not use the network'))

const TOPIC = { id: 7, name: 'Fake topic', slug: 'fake-topic', door: 'framework' as const }

const POST: PostDetail = {
  id: 1,
  title: 'A fake question that runs on for a while before it ends?',
  slug: 'fake-article',
  excerpt: 'A fake excerpt.',
  publishedAt: '2026-11-21T08:30:00.000Z',
  updatedAt: '2026-11-22T09:00:00.000Z',
  readingTime: 3,
  topics: [TOPIC],
  body: buildEditorState({ text: 'Fake body words.' }) as PostDetail['body'],
  question: 'What would a fake reader carry home?',
  author: 'founder',
  authorName: null,
  searchTitle: 'A fake search title',
  description: null,
}

/** What the fake Journal holds: its topics with an article, its pages, its articles. */
function journalHolds({ posts = [POST], totalPages = 1 } = {}) {
  vi.mocked(getTopics).mockResolvedValue(posts.length > 0 ? [TOPIC] : [])
  vi.mocked(listPosts).mockResolvedValue({
    docs: posts,
    totalDocs: posts.length,
    totalPages,
    page: 1,
  })
  vi.mocked(getPost).mockImplementation(
    async (slug) => posts.find((post) => post.slug === slug) ?? null,
  )
}

const get = (...slug: string[]) =>
  GET(new Request(`http://localhost/og/${slug.join('/')}`), { params: Promise.resolve({ slug }) })

async function pngOf(input: ShareImageInput): Promise<Buffer> {
  return Buffer.from(await (await shareImage(input)).arrayBuffer())
}

async function bodyOf(response: Response): Promise<Buffer> {
  return Buffer.from(await response.arrayBuffer())
}

beforeEach(() => {
  fetchSpy.mockClear()
  journalHolds()
})

afterAll(() => {
  fetchSpy.mockRestore()
})

describe('an article’s byline on its share image', () => {
  it('is the author’s name in the letters the image’s font holds', () => {
    expect(shareImageByline(FOUNDER.name)).toBe(FOUNDER.name)
    expect(shareImageByline('  Fake   Āuthor ')).toBe('Fake Author')
    expect(shareImageByline('Fake Zoë')).toBe('Fake Zoë')
  })

  it('is nothing for a placeholder, a name the font cannot draw, or a name past one line', () => {
    expect(AUTHOR_NAME_MAX).toBe(SHARE_IMAGE_BYLINE_MAX)
    for (const none of [
      undefined,
      null,
      '',
      '[[TODO: the author, I-19]]',
      'ગૌરાંગ',
      '😀',
      'F'.repeat(SHARE_IMAGE_BYLINE_MAX + 1),
    ]) {
      expect(shareImageByline(none), String(none)).toBeUndefined()
    }
    expect(shareImageByline('F'.repeat(SHARE_IMAGE_BYLINE_MAX))).toBeDefined()
  })

  it('is drawn under the title in place of the city, with no request for a font', async () => {
    const withByline = await pngOf({ title: POST.title, byline: FOUNDER.name })
    const without = await pngOf({ title: POST.title })
    expect(withByline.equals(without)).toBe(false)
    // A name in another script draws nothing in its place: the image is the plain one.
    expect((await pngOf({ title: POST.title, byline: 'ગૌરાંગ' })).equals(without)).toBe(true)
    const { width, height } = await sharp(withByline).metadata()
    expect({ width, height }).toEqual(SHARE_IMAGE_SIZE)
    expect(fetchSpy.mock.calls.filter(([input]) => !String(input).startsWith('data:'))).toEqual([])
  }, 60_000)
})

describe('/og/journal/…', () => {
  it('draws the Journal’s title for the Journal', async () => {
    const response = await get('journal')
    expect(response.status).toBe(200)
    expect((await bodyOf(response)).equals(await pngOf({ title: JOURNAL_PAGE.title }))).toBe(true)
  }, 60_000)

  it('draws an article’s own title and its author, at the address its metadata gives', async () => {
    const image = (articleMetadata(POST).openGraph?.images as { url: string }[])[0]?.url ?? ''
    const url = new URL(image, 'http://localhost')
    expect(url.pathname).toBe('/og/journal/fake-article')
    const slug = url.pathname.slice('/og/'.length).split('/')
    const response = await GET(new Request(url), { params: Promise.resolve({ slug }) })
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    expect(
      (await bodyOf(response)).equals(await pngOf({ title: POST.title, byline: FOUNDER.name })),
    ).toBe(true)
  }, 60_000)

  it('draws a topic’s title, and a later page’s, where the site serves them', async () => {
    const topic = await get('journal', 'topic', 'fake-topic')
    expect(topic.status).toBe(200)
    expect((await bodyOf(topic)).equals(await pngOf({ title: 'The Journal: Fake topic' }))).toBe(
      true,
    )
    journalHolds({ totalPages: 2 })
    const later = await get('journal', 'page', '2')
    expect(later.status).toBe(200)
    expect((await bodyOf(later)).equals(await pngOf({ title: 'The Journal, page 2' }))).toBe(true)
  }, 60_000)

  it('gives a plain 404 where the Journal shows nothing', async () => {
    for (const slug of [
      ['journal', 'no-such-article'],
      ['journal', 'topic', 'no-such-topic'],
      ['journal', 'page', '2'],
      ['journal', 'page', '1'],
      ['journal', 'topic', 'fake-topic', 'page', '2'],
      ['journal', 'fake-article', 'more'],
    ]) {
      const response = await get(...slug)
      expect(response.status, slug.join('/')).toBe(404)
      expect((await response.arrayBuffer()).byteLength, slug.join('/')).toBe(0)
    }
    // While nothing is published, no topic has an image.
    journalHolds({ posts: [] })
    expect((await get('journal', 'topic', 'fake-topic')).status).toBe(404)
    expect((await get('journal')).status).toBe(200)
  }, 60_000)
})
