// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CmsPage, { generateMetadata } from '@/app/(platform)/(default)/[...slug]/page'
import { STARTER_PAGES, starterAt } from '@/content/starter'
import { getPage } from '@/lib/content/pages'
import { PAGES_TAG, pageTag, revalidatePages } from '@/lib/content/revalidate'
import type { PageContent } from '@/lib/content/types'
import { redirectFor, redirectOrNotFound } from '@/lib/redirects/lookup'

// What a visitor is shown at an address (D-51, D-57), against a fake Payload. The cache is a
// pass-through that records its key and tags; React's cache passes through outside a server
// component, so every call below reads the fakes afresh.
const { find, count, cacheCalls } = vi.hoisted(() => ({
  find: vi.fn(),
  count: vi.fn(),
  cacheCalls: [] as unknown[][],
}))

vi.mock('server-only', () => ({}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => ({ find, count }) }))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: () => unknown, key: string[], options: unknown) => {
    cacheCalls.push([key, options])
    return fn
  },
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('fake not found')
  },
}))
vi.mock('@/lib/content/revalidate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/content/revalidate')>()),
  revalidatePages: vi.fn(),
}))
// The redirects the site follows (src/lib/redirects/lookup.ts): none, unless a test sets one.
vi.mock('@/lib/redirects/lookup', () => ({
  redirectFor: vi.fn(async () => null),
  redirectOrNotFound: vi.fn(async () => {
    throw new Error('fake not found')
  }),
}))

/** A page published in the admin at the framework page's address. Obviously fake. */
const PUBLISHED: PageContent = {
  title: 'Fake published page',
  slug: 'framework',
  layout: [{ blockType: 'hero', heading: 'Fake heading', copyStatus: 'approved' }],
}

/** What the admin holds at an address: its published page, and whether one was ever published. */
function adminHolds(published: PageContent | null, everPublished = published !== null) {
  find.mockResolvedValue({ docs: published ? [published] : [] })
  count.mockResolvedValue({ totalDocs: everPublished ? 1 : 0 })
}

beforeEach(() => {
  find.mockReset()
  count.mockReset()
  vi.mocked(revalidatePages).mockClear()
  vi.mocked(redirectFor).mockReset()
  vi.mocked(redirectFor).mockResolvedValue(null)
  vi.mocked(redirectOrNotFound).mockClear()
  cacheCalls.length = 0
  adminHolds(null)
})

describe('the page at an address (D-51, D-57)', () => {
  it('is the published page, which wins over the starter page', async () => {
    adminHolds(PUBLISHED)
    expect(await getPage('framework')).toEqual(PUBLISHED)
    // A published page needs no second question.
    expect(count).not.toHaveBeenCalled()
  })

  it('is the starter page while no page there has ever been published', async () => {
    expect(await getPage('framework')).toBe(STARTER_PAGES.framework)
    expect(count).toHaveBeenCalledWith({
      collection: 'pages',
      where: { and: [{ slug: { equals: 'framework' } }, { firstPublishedAt: { exists: true } }] },
      overrideAccess: true,
    })
  })

  it('is the 404 while a page that was published there is unpublished', async () => {
    adminHolds(null, true)
    // The home page too: D-57 makes no exception for any address.
    expect(await getPage('framework')).toBeNull()
    expect(await getPage('home')).toBeNull()
  })

  it('gives way to a redirect from its address while only its starter page is there (D-57)', async () => {
    vi.mocked(redirectFor).mockResolvedValue({ from: '/framework', to: '/team', status: '308' })
    expect(await getPage('framework')).toBeNull()
    expect(redirectFor).toHaveBeenCalledWith('/framework')
    // The home page lives at "/".
    await getPage('home')
    expect(redirectFor).toHaveBeenLastCalledWith('/')
  })

  it('is the published page whatever the redirects say, and asks them nothing', async () => {
    adminHolds(PUBLISHED)
    vi.mocked(redirectFor).mockResolvedValue({ from: '/framework', to: '/team', status: '308' })
    expect(await getPage('framework')).toEqual(PUBLISHED)
    expect(redirectFor).not.toHaveBeenCalled()
  })

  it('asks the redirects nothing where there is no starter page to give way', async () => {
    await getPage('no-such-page')
    adminHolds(null, true)
    await getPage('framework')
    expect(redirectFor).not.toHaveBeenCalled()
  })

  it('is the 404 where there is no page and no starter page, whatever the name', async () => {
    for (const slug of ['no-such-page', 'constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(await getPage(slug), slug).toBeNull()
    }
  })

  it('is read as a visitor reads it, and cached under the page’s own tags', async () => {
    await getPage('framework')
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'pages',
        where: { slug: { equals: 'framework' } },
        overrideAccess: false,
        depth: 0,
      }),
    )
    expect(cacheCalls).toEqual([
      [['page-state', 'framework'], { tags: [PAGES_TAG, pageTag('framework')] }],
    ])
  })
})

describe('a starter page by its address', () => {
  it('is found only among the starter pages themselves', () => {
    expect(starterAt('framework')).toBe(STARTER_PAGES.framework)
    for (const [slug, page] of Object.entries(STARTER_PAGES)) expect(starterAt(slug)).toBe(page)
    // Names every object has must not pass for pages.
    for (const slug of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
      expect(starterAt(slug), slug).toBeUndefined()
    }
  })

  it('answers /constructor with the site’s 404, as any address with no page', async () => {
    for (const slug of [['constructor'], ['toString'], ['no-such-page']]) {
      const params = Promise.resolve({ slug })
      await expect(CmsPage({ params }), slug.join('/')).rejects.toThrow('fake not found')
      expect(await generateMetadata({ params }), slug.join('/')).toEqual({})
    }
  })
})

describe('an address with no page', () => {
  it('is answered by the redirect from it before the 404, whatever it looks like', async () => {
    for (const slug of [['no-such-page'], ['Old', 'Page.html'], ['home']]) {
      const params = Promise.resolve({ slug })
      await expect(CmsPage({ params }), slug.join('/')).rejects.toThrow('fake not found')
      expect(redirectOrNotFound).toHaveBeenLastCalledWith(`/${slug.join('/')}`)
    }
  })
})
