// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { STARTER_PAGES } from '@/content/starter'
import { PAGES_TAG } from '@/lib/content/revalidate'
import { redirectTable } from '@/lib/redirects/lookup'
import { sitemapEntries } from '@/lib/seo/sitemap'
import { sitemapSource } from '@/lib/seo/sitemapSource'

// What the sitemap and llms.txt read from the CMS (src/lib/seo/sitemapSource.ts), against a
// fake Payload. The cache records its key and tags, and passes through to the CMS unless a
// test gives it an entry of its own to answer with.
const { find, cacheCalls, cacheEntry } = vi.hoisted(() => ({
  find: vi.fn(),
  cacheCalls: [] as unknown[][],
  cacheEntry: { value: undefined as unknown },
}))

vi.mock('server-only', () => ({}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => ({ find }) }))
// The redirects the site follows (src/lib/redirects/lookup.ts, cached by tags of their own):
// none, unless a test sets some.
vi.mock('@/lib/redirects/lookup', () => ({ redirectTable: vi.fn(async () => []) }))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: () => unknown, key: string[], options: unknown) => {
    cacheCalls.push([key, options])
    return async () => cacheEntry.value ?? fn()
  },
}))

type Query = { where: Record<string, unknown>; overrideAccess: boolean }

/** The pages the fake CMS holds. Obviously fake. */
const HELD = {
  published: [
    { id: 1, slug: 'framework', updatedAt: '2026-11-20T10:00:00.000Z' },
    { id: 2, slug: 'fake-page', updatedAt: '2026-11-21T08:30:00.000Z' },
  ],
  everPublished: [
    { id: 1, slug: 'framework' },
    { id: 2, slug: 'fake-page' },
    { id: 3, slug: 'learn' },
  ],
}

beforeEach(() => {
  cacheEntry.value = undefined
  find.mockReset()
  find.mockImplementation(async ({ where }: Query) => ({
    docs: '_status' in where ? HELD.published : HELD.everPublished,
  }))
  vi.mocked(redirectTable).mockResolvedValue([])
})

describe('what the sitemap reads from the CMS', () => {
  it('is the starter pages, the pages published now and every address ever published', async () => {
    expect(await sitemapSource()).toEqual({
      starterSlugs: Object.keys(STARTER_PAGES),
      published: [
        { slug: 'framework', updatedAt: '2026-11-20T10:00:00.000Z' },
        { slug: 'fake-page', updatedAt: '2026-11-21T08:30:00.000Z' },
      ],
      everPublished: ['framework', 'fake-page', 'learn'],
      redirected: [],
    })
  })

  it('leaves out a starter page whose address a redirect leads from (D-57)', async () => {
    vi.mocked(redirectTable).mockResolvedValue([
      { from: '/about', to: '/fake-page', status: '308' },
      { from: '/framework', to: '/fake-page', status: '307' },
    ])
    const source = await sitemapSource()
    expect(source.redirected).toEqual(['/about', '/framework'])
    const urls = sitemapEntries(source, 'https://fake.example').map(({ url }) => url)
    expect(urls).not.toContain('https://fake.example/about')
    // A published page wins over a redirect from its address.
    expect(urls).toContain('https://fake.example/framework')
  })

  it('reads the published pages as a visitor does, so that no draft is listed', async () => {
    await sitemapSource()
    expect(find).toHaveBeenCalledTimes(2)
    expect(find).toHaveBeenCalledWith({
      collection: 'pages',
      where: { _status: { equals: 'published' } },
      limit: 1000,
      pagination: false,
      depth: 0,
      overrideAccess: false,
      select: { slug: true, updatedAt: true },
    })
  })

  it('reads past the access rules only for the addresses, never for a page', async () => {
    await sitemapSource()
    const open = find.mock.calls.map(([query]) => query as Query & { select: object })
    const pastTheRules = open.filter((query) => query.overrideAccess)
    expect(pastTheRules).toEqual([
      {
        collection: 'pages',
        where: { firstPublishedAt: { exists: true } },
        limit: 1000,
        pagination: false,
        depth: 0,
        overrideAccess: true,
        select: { slug: true },
      },
    ])
  })

  it('is cached under the tag every page change marks stale (docs/12 §4)', () => {
    expect(cacheCalls).toEqual([[['sitemap-cms-pages'], { tags: [PAGES_TAG] }]])
  })

  it('caches only what the CMS holds: the starter pages are this deployment’s own', async () => {
    // An entry kept from an earlier deployment, which listed other starter pages.
    cacheEntry.value = {
      starterSlugs: ['fake-gone-starter'],
      published: [{ slug: 'fake-page', updatedAt: '2026-11-21T08:30:00.000Z' }],
      everPublished: ['fake-page'],
    }
    expect(await sitemapSource()).toEqual({
      starterSlugs: Object.keys(STARTER_PAGES),
      published: [{ slug: 'fake-page', updatedAt: '2026-11-21T08:30:00.000Z' }],
      everPublished: ['fake-page'],
      redirected: [],
    })
    // The CMS was not asked: the cached entry answered.
    expect(find).not.toHaveBeenCalled()
  })

  it('gives the sitemap its pages: published ones dated, an unpublished one left out', async () => {
    const urls = sitemapEntries(await sitemapSource(), 'https://fake.example')
    expect(urls).toContainEqual({
      url: 'https://fake.example/framework',
      lastModified: '2026-11-20T10:00:00.000Z',
    })
    expect(urls).toContainEqual({
      url: 'https://fake.example/fake-page',
      lastModified: '2026-11-21T08:30:00.000Z',
    })
    // Published once, not now: the 404 (D-57).
    expect(urls.map(({ url }) => url)).not.toContain('https://fake.example/learn')
  })
})
