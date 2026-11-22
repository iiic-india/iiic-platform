// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { STARTER_PAGES } from '@/content/starter'
import { recordEventQuietly } from '@/lib/analytics/record'
import { reportError } from '@/lib/monitoring/sentry'
import {
  countNoResults,
  MAX_RESULTS,
  NO_RESULT_COUNTS_PER_MINUTE,
  searchSite,
  SEARCHES_PER_MINUTE,
} from '@/lib/search/query'
import { sitemapSource } from '@/lib/seo/sitemapSource'

// Searching the site (docs/11 §5.3; docs/12 §7): the index through Payload's like, the starter
// pages the site still shows by the same rule, and the one thing counted, a search that found
// nothing, without its words. The database, the analytics recorder and Sentry are faked.
const state = vi.hoisted(() => ({ vercelEnv: 'production' as string | undefined }))
const { find } = vi.hoisted(() => ({ find: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => ({ find }) }))
vi.mock('next/server', () => ({ after: (task: () => unknown) => task() }))
vi.mock('@/lib/env', () => ({ env: () => ({ VERCEL_ENV: state.vercelEnv }) }))
vi.mock('@/lib/monitoring/sentry', () => ({ reportError: vi.fn(async () => false) }))
vi.mock('@/lib/analytics/record', () => ({ recordEventQuietly: vi.fn(async () => undefined) }))
vi.mock('@/lib/seo/sitemapSource', () => ({ sitemapSource: vi.fn() }))

const source = (published: string[] = [], everPublished: string[] = published) => ({
  starterSlugs: Object.keys(STARTER_PAGES),
  published: published.map((slug) => ({ slug, updatedAt: null })),
  everPublished,
  redirected: [],
  posts: [],
  topics: [],
})

const indexEntry = (overrides: Record<string, unknown>) => ({
  id: 1,
  title: 'Fake indexed page',
  url: '/fake-indexed',
  excerpt: null,
  content: 'Fake indexed page\nA fake sentence about the framework.',
  priority: 40,
  doc: { relationTo: 'pages', value: 1 },
  ...overrides,
})

const urls = (outcome: Awaited<ReturnType<typeof searchSite>>) =>
  outcome.state === 'done'
    ? outcome.groups.flatMap((group) => group.results.map((result) => result.url))
    : []

beforeEach(() => {
  find.mockReset()
  find.mockResolvedValue({ docs: [] })
  vi.mocked(sitemapSource).mockReset()
  vi.mocked(sitemapSource).mockResolvedValue(source())
  vi.mocked(reportError).mockClear()
  vi.mocked(recordEventQuietly).mockClear()
  state.vercelEnv = 'production'
})

describe('a search', () => {
  it('is no search without words: nothing is read', async () => {
    for (const query of [undefined, '', '   ', '?!', ['']]) {
      expect(await searchSite(query)).toEqual({ state: 'empty' })
    }
    expect(find).not.toHaveBeenCalled()
  })

  it('asks the index for every word in an entry’s text, as a visitor may read it', async () => {
    await searchSite('  Subjective   self? ')
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'search-index',
        where: { content: { like: 'Subjective self' } },
        sort: '-priority',
        limit: MAX_RESULTS,
        depth: 0,
        overrideAccess: false,
      }),
    )
  })

  it('never hands LIKE a wildcard', async () => {
    await searchSite('100%_\\')
    expect(find.mock.calls[0]?.[0]).toMatchObject({ where: { content: { like: '100' } } })
  })

  it('finds the starter pages the site shows, by the same rule, beside the index’s entries', async () => {
    find.mockResolvedValue({ docs: [indexEntry({})] })
    const outcome = await searchSite('framework')
    expect(outcome.state).toBe('done')
    expect(urls(outcome)).toContain('/fake-indexed')
    expect(urls(outcome)).toContain('/framework')
    // A starter page that does not hold the word is not a result.
    find.mockResolvedValue({ docs: [] })
    const none = await searchSite('zzfakeword')
    expect(none).toMatchObject({ state: 'done', total: 0, partial: false, query: 'zzfakeword' })
  })

  it('leaves out a starter page once a page there has been published, now or before (D-57)', async () => {
    vi.mocked(sitemapSource).mockResolvedValue(source(['framework']))
    expect(urls(await searchSite('framework'))).not.toContain('/framework')
    vi.mocked(sitemapSource).mockResolvedValue(source([], ['framework']))
    expect(urls(await searchSite('framework'))).not.toContain('/framework')
  })

  it('drops an entry of no known kind, or whose address is never indexed', async () => {
    find.mockResolvedValue({
      docs: [
        indexEntry({ url: '/book/session' }),
        indexEntry({ doc: { relationTo: 'people', value: 1 } }),
        indexEntry({ title: null }),
      ],
    })
    vi.mocked(sitemapSource).mockResolvedValue(source(Object.keys(STARTER_PAGES)))
    expect(await searchSite('framework')).toMatchObject({ state: 'done', total: 0 })
  })

  it('still searches the rest when the index cannot be read, and says so', async () => {
    find.mockRejectedValue(new Error('fake database error'))
    const outcome = await searchSite('framework')
    expect(outcome).toMatchObject({ state: 'done', partial: true })
    expect(urls(outcome)).toContain('/framework')
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), { area: 'search' })
  })
})

describe('a search that found nothing', () => {
  const visitor = () =>
    new Headers({ 'x-forwarded-for': '203.0.113.7', 'user-agent': 'Mozilla/5.0 (fake)' })

  it('is counted as search_no_results on /search, without its words', () => {
    countNoResults(visitor())
    expect(recordEventQuietly).toHaveBeenCalledTimes(1)
    expect(vi.mocked(recordEventQuietly).mock.calls[0]?.[0]).toEqual({
      name: 'search_no_results',
      route: '/search',
      register: 'default',
    })
  })

  it('is never counted for a prefetch or on a preview deployment', () => {
    countNoResults(new Headers({ 'next-router-prefetch': '1' }))
    countNoResults(new Headers({ 'sec-purpose': 'prefetch' }))
    state.vercelEnv = 'preview'
    countNoResults(visitor())
    expect(recordEventQuietly).not.toHaveBeenCalled()
  })

  it('is counted at most so many times a minute on one server', () => {
    for (let count = 0; count < NO_RESULT_COUNTS_PER_MINUTE + 5; count += 1) {
      countNoResults(visitor())
    }
    // The first test of this group took one of the minute's counts.
    expect(recordEventQuietly).toHaveBeenCalledTimes(NO_RESULT_COUNTS_PER_MINUTE - 1)
  })
})

describe('this server’s share of searches', () => {
  it('runs out after so many a minute, and then reads nothing', async () => {
    let busy = 0
    for (let count = 0; count < SEARCHES_PER_MINUTE + 5; count += 1) {
      if ((await searchSite('self')).state === 'busy') busy += 1
    }
    expect(busy).toBeGreaterThan(0)
    find.mockClear()
    expect(await searchSite('self')).toEqual({ state: 'busy', query: 'self' })
    expect(find).not.toHaveBeenCalled()
  })
})
