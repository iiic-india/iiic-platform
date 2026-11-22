// @vitest-environment node
import { resolveSitemap } from 'next/dist/build/webpack/loaders/metadata/resolve-route-data'
import { connection } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import sitemap, { maxDuration, runtime } from '@/app/sitemap'
import { STARTER_PAGES } from '@/content/starter'
import { pagePath } from '@/lib/content/slug'
import { JOURNAL_PAGE } from '@/lib/seo/appPages'
import { isNoindexPath } from '@/lib/seo/paths'
import { servedPages, sitemapEntries, type SitemapSource } from '@/lib/seo/sitemap'
import { sitemapSource } from '@/lib/seo/sitemapSource'

// The sitemap (src/lib/seo/sitemap.ts; plan A4): what the site serves today (D-51, D-57), and
// nothing a search engine may not list (D-67). The CMS is faked: sitemapSource is what the
// route reads it through.
vi.mock('next/server', () => ({ connection: vi.fn(async () => undefined) }))
vi.mock('@/lib/seo/sitemapSource', () => ({ sitemapSource: vi.fn() }))

const ORIGIN = 'https://fake.example'
const STARTERS = Object.keys(STARTER_PAGES)

/** What the CMS holds: nothing, unless a test says otherwise. Slugs and dates are fake. */
const source = (held: Partial<SitemapSource> = {}): SitemapSource => ({
  starterSlugs: STARTERS,
  published: [],
  everPublished: [],
  posts: [],
  topics: [],
  ...held,
})

/** The pages the app draws itself, after the CMS's: Find your path and the Journal. */
const APP = ['/map', '/journal']

/** Two published articles, newest first, and the topic that holds them. Obviously fake. */
const JOURNAL: Pick<SitemapSource, 'posts' | 'topics'> = {
  posts: [
    {
      slug: 'fake-newer-article',
      title: 'A fake newer article?',
      excerpt: 'A fake excerpt.',
      publishedAt: '2026-11-21T08:30:00.000Z',
      updatedAt: '2026-11-22T09:00:00.000Z',
    },
    {
      slug: 'fake-older-article',
      title: 'A fake older article?',
      excerpt: 'Another fake excerpt.',
      publishedAt: '2026-10-30T08:30:00.000Z',
      updatedAt: '2026-10-30T08:30:00.000Z',
    },
  ],
  topics: [{ slug: 'fake-topic', name: 'Fake topic' }],
}

const urls = (held: Partial<SitemapSource> = {}) =>
  sitemapEntries(source(held), ORIGIN).map((entry) => entry.url)

beforeEach(() => {
  vi.mocked(sitemapSource).mockReset()
  vi.mocked(connection).mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the sitemap', () => {
  it('lists every starter page, Find your path and the Journal while the CMS holds nothing, with no date', () => {
    const entries = sitemapEntries(source(), ORIGIN)
    expect(entries).toEqual(
      [...STARTERS.map(pagePath), ...APP].map((path) => ({
        url: path === '/' ? `${ORIGIN}/` : `${ORIGIN}${path}`,
      })),
    )
    // No date is known for a starter page, so none is invented; no priority, no frequency.
    for (const entry of entries) expect(Object.keys(entry)).toEqual(['url'])
  })

  it('gives the home page as the origin with its slash', () => {
    expect(urls()[0]).toBe(`${ORIGIN}/`)
    expect(urls()).not.toContain(ORIGIN)
    expect(urls()).not.toContain(`${ORIGIN}/home`)
  })

  it('lists a published page with the date it last changed', () => {
    const entries = sitemapEntries(
      source({
        published: [{ slug: 'framework', updatedAt: '2026-11-20T10:00:00.000Z' }],
        everPublished: ['framework'],
      }),
      ORIGIN,
    )
    expect(entries).toContainEqual({
      url: `${ORIGIN}/framework`,
      lastModified: '2026-11-20T10:00:00.000Z',
    })
    // Every other starter page is still served, and still has no date.
    expect(entries).toHaveLength(STARTERS.length + APP.length)
    expect(entries.filter((entry) => 'lastModified' in entry)).toHaveLength(1)
  })

  it('leaves out a page that was published and is not now: its address is a 404 (D-57)', () => {
    const listed = urls({ everPublished: ['framework', 'home'] })
    expect(listed).not.toContain(`${ORIGIN}/framework`)
    expect(listed).not.toContain(`${ORIGIN}/`)
    expect(listed).toContain(`${ORIGIN}/about`)
    expect(listed).toHaveLength(STARTERS.length - 2 + APP.length)
  })

  it('lists a published page that has no starter file, after the starter pages', () => {
    const entries = sitemapEntries(
      source({
        published: [
          { slug: 'organisations/fake-service', updatedAt: '2026-11-21T08:30:00.000Z' },
          { slug: 'fake-page', updatedAt: null },
        ],
        everPublished: ['organisations/fake-service', 'fake-page'],
      }),
      ORIGIN,
    )
    expect(entries.slice(STARTERS.length)).toEqual([
      { url: `${ORIGIN}/organisations/fake-service`, lastModified: '2026-11-21T08:30:00.000Z' },
      { url: `${ORIGIN}/fake-page` },
      { url: `${ORIGIN}/map` },
      { url: `${ORIGIN}/journal` },
    ])
  })

  it('lists the Journal’s topics that hold an article, then its articles, newest first, each with the date it last changed', () => {
    const entries = sitemapEntries(source(JOURNAL), ORIGIN)
    expect(entries.slice(STARTERS.length + APP.length)).toEqual([
      { url: `${ORIGIN}/journal/topic/fake-topic` },
      { url: `${ORIGIN}/journal/fake-newer-article`, lastModified: '2026-11-22T09:00:00.000Z' },
      { url: `${ORIGIN}/journal/fake-older-article`, lastModified: '2026-10-30T08:30:00.000Z' },
    ])
    // The Journal's later pages are reached by its links, not listed.
    expect(entries.map(({ url }) => url).filter((url) => url.includes('/page/'))).toEqual([])
  })

  it('leaves the Journal’s addresses to the Journal: a page published there is never shown', () => {
    const listed = urls({
      published: [
        { slug: 'journal', updatedAt: '2026-11-20T10:00:00.000Z' },
        { slug: 'journal/fake-page', updatedAt: '2026-11-20T10:00:00.000Z' },
        { slug: 'journal/topic/fake', updatedAt: '2026-11-20T10:00:00.000Z' },
      ],
      everPublished: ['journal', 'journal/fake-page', 'journal/topic/fake'],
    })
    expect(listed).toEqual(urls())
    expect(listed.filter((url) => url === `${ORIGIN}/journal`)).toHaveLength(1)
  })

  it('leaves out an article or a topic whose address the Journal could not serve', () => {
    const listed = urls({
      posts: [
        { slug: 'page', title: 'Fake reserved address' },
        { slug: 'topic', title: 'Another fake reserved address' },
        { slug: 'Fake Spaces', title: 'A fake address with spaces' },
      ],
      topics: [{ slug: 'Fake/Topic', name: 'Fake topic' }],
    })
    expect(listed).toEqual(urls())
  })

  it('leaves out every route that is never indexed, published there or not (D-67)', () => {
    const hidden = [
      'book/session',
      'b/fake-token',
      'feedback/fake-token',
      'subscribe/confirm/fake-token',
      'account',
      'search',
      'login',
      'map/go',
      'map/result/fake-id',
      'institute/verify',
      'institute/verify/fake-token',
      'admin/fake',
      'api/fake',
    ]
    for (const slug of hidden) expect(isNoindexPath(pagePath(slug)), slug).toBe(true)
    const listed = urls({
      published: hidden.map((slug) => ({ slug, updatedAt: '2026-11-21T08:30:00.000Z' })),
      everPublished: hidden,
    })
    expect(listed).toEqual(urls())
    for (const url of listed) expect(isNoindexPath(new URL(url).pathname), url).toBe(false)
  })

  it('lists no address twice', () => {
    const listed = urls({
      starterSlugs: [...STARTERS, 'about'],
      published: [
        { slug: 'about', updatedAt: '2026-11-20T10:00:00.000Z' },
        { slug: 'fake-page', updatedAt: '2026-11-20T10:00:00.000Z' },
        { slug: 'fake-page', updatedAt: '2026-11-21T10:00:00.000Z' },
      ],
      everPublished: ['about', 'fake-page'],
    })
    expect(new Set(listed).size).toBe(listed.length)
    expect(listed.filter((url) => url === `${ORIGIN}/about`)).toHaveLength(1)
  })

  it('keeps an address the app draws for the app: a page published there is never shown', () => {
    const entries = sitemapEntries(
      source({
        published: [{ slug: 'map', updatedAt: '2026-11-20T10:00:00.000Z' }],
        everPublished: ['map'],
      }),
      ORIGIN,
    )
    expect(entries.filter((entry) => entry.url === `${ORIGIN}/map`)).toEqual([
      { url: `${ORIGIN}/map` },
    ])
  })

  it('leaves out a page published under /og/: the share images’ route answers there', () => {
    const listed = urls({
      published: [
        { slug: 'og/about', updatedAt: '2026-11-20T10:00:00.000Z' },
        { slug: 'og/fake/page', updatedAt: '2026-11-20T10:00:00.000Z' },
      ],
      everPublished: ['og/about', 'og/fake/page'],
    })
    expect(listed).toEqual(urls())
    for (const url of listed) expect(new URL(url).pathname.startsWith('/og/'), url).toBe(false)
    // The page at /about is still listed, once.
    expect(listed.filter((url) => url === `${ORIGIN}/about`)).toHaveLength(1)
  })

  it('is written by Next.js with each address and its date, and nothing else', () => {
    const xml = resolveSitemap(
      sitemapEntries(
        source({
          starterSlugs: ['home', 'about'],
          published: [{ slug: 'about', updatedAt: '2026-11-20T10:00:00.000Z' }],
          everPublished: ['about'],
        }),
        ORIGIN,
      ),
    )
    expect(xml).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '<url>',
        `<loc>${ORIGIN}/</loc>`,
        '</url>',
        '<url>',
        `<loc>${ORIGIN}/about</loc>`,
        '<lastmod>2026-11-20T10:00:00.000Z</lastmod>',
        '</url>',
        '<url>',
        `<loc>${ORIGIN}/map</loc>`,
        '</url>',
        '<url>',
        `<loc>${ORIGIN}/journal</loc>`,
        '</url>',
        '</urlset>',
        '',
      ].join('\n'),
    )
    expect(xml).not.toMatch(/priority|changefreq/)
  })

  it('points at the platform domain unless the deployment names its own origin', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    for (const { url } of sitemapEntries(source())) {
      expect(url.startsWith('https://imagecatalysts.in/'), url).toBe(true)
    }
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000')
    expect(sitemapEntries(source())[0]?.url).toBe('http://localhost:3000/')
  })
})

describe('the pages the site serves', () => {
  it('are given once each, with the slug of every page the CMS or a starter file holds', () => {
    const served = servedPages(
      source({
        published: [
          { slug: 'home', updatedAt: '2026-11-20T10:00:00.000Z' },
          { slug: 'fake-page', updatedAt: '2026-11-21T10:00:00.000Z' },
        ],
        everPublished: ['home', 'fake-page', 'learn'],
      }),
    )
    expect(served[0]).toEqual({ path: '/', slug: 'home', updatedAt: '2026-11-20T10:00:00.000Z' })
    expect(served.map(({ path }) => path)).toEqual([
      ...STARTERS.filter((slug) => slug !== 'learn').map(pagePath),
      '/fake-page',
      ...APP,
    ])
    // The app's own pages have no slug: no page in the CMS stands behind them.
    expect(served.slice(-APP.length)).toEqual(APP.map((path) => ({ path })))
    expect(served.filter(({ slug }) => slug === undefined)).toHaveLength(APP.length)
  })

  it('give the Journal’s topics and articles their own words, and each article its date', () => {
    const served = servedPages(
      source({
        posts: [
          {
            slug: 'fake-article',
            title: 'A fake article whose title is far too long for a browser tab to hold?',
            searchTitle: 'A fake search title',
            excerpt: 'A fake excerpt.',
            publishedAt: '2026-11-21T08:30:00.000Z',
            updatedAt: '2026-11-22T09:00:00.000Z',
          },
          {
            slug: 'fake-described-article',
            title: 'A fake short title?',
            excerpt: 'A fake excerpt.',
            description: 'A fake description.',
            publishedAt: '2026-11-20T08:30:00.000Z',
          },
        ],
        topics: [
          { slug: 'fake-topic', name: 'Fake topic' },
          { slug: 'fake-described-topic', name: 'Fake', description: 'A fake topic description.' },
        ],
      }),
    )
    expect(served.slice(STARTERS.length + APP.length)).toEqual([
      {
        path: '/journal/topic/fake-topic',
        journal: { title: 'The Journal: Fake topic', description: JOURNAL_PAGE.description },
      },
      {
        path: '/journal/topic/fake-described-topic',
        journal: { title: 'The Journal: Fake', description: 'A fake topic description.' },
      },
      {
        path: '/journal/fake-article',
        updatedAt: '2026-11-22T09:00:00.000Z',
        journal: {
          title: 'A fake search title',
          description: 'A fake excerpt.',
          publishedAt: '2026-11-21T08:30:00.000Z',
        },
      },
      {
        path: '/journal/fake-described-article',
        updatedAt: null,
        journal: {
          title: 'A fake short title?',
          description: 'A fake description.',
          publishedAt: '2026-11-20T08:30:00.000Z',
        },
      },
    ])
  })
})

describe('the route /sitemap.xml', () => {
  it('reads the CMS per request, and lists what it holds on the deployment’s origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', ORIGIN)
    vi.mocked(sitemapSource).mockResolvedValue(
      source({
        starterSlugs: ['home', 'about', 'learn'],
        published: [{ slug: 'about', updatedAt: '2026-11-20T10:00:00.000Z' }],
        everPublished: ['about', 'learn'],
      }),
    )
    expect(await sitemap()).toEqual([
      { url: `${ORIGIN}/` },
      { url: `${ORIGIN}/about`, lastModified: '2026-11-20T10:00:00.000Z' },
      { url: `${ORIGIN}/map` },
      { url: `${ORIGIN}/journal` },
    ])
    // Rendered per request (D-42), so a page published in the admin is listed at once.
    expect(connection).toHaveBeenCalledTimes(1)
    expect(sitemapSource).toHaveBeenCalledTimes(1)
  })

  it('declares its runtime and time limit (docs/12 §6)', () => {
    expect(runtime).toBe('nodejs')
    expect(maxDuration).toBe(10)
  })
})
