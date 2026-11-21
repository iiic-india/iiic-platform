// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PAGES_TAG } from '@/lib/content/revalidate'
import { logMissingPage } from '@/lib/redirects/log'
import {
  followRedirect,
  redirectFor,
  redirectOrNotFound,
  redirectTable,
} from '@/lib/redirects/lookup'
import { REDIRECTS_TAG } from '@/lib/redirects/revalidate'

// How the routes answer an address with no page (src/lib/redirects/lookup.ts): the redirect
// from it, cached until a redirect or a page changes, else the 404, which alone writes the 404
// log. Payload, the cache, the log and Next.js's navigation are faked; React's cache passes
// through outside a server render.
const { find, cacheCalls, navigation } = vi.hoisted(() => ({
  find: vi.fn(),
  cacheCalls: [] as unknown[][],
  navigation: {
    redirect: vi.fn((to: string) => {
      throw new Error(`fake 307 to ${to}`)
    }),
    permanentRedirect: vi.fn((to: string) => {
      throw new Error(`fake 308 to ${to}`)
    }),
    notFound: vi.fn(() => {
      throw new Error('fake not found')
    }),
  },
}))

vi.mock('server-only', () => ({}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => ({ find }) }))
vi.mock('next/navigation', () => navigation)
// When and what the log writes is its own business (tests/unit/missingPageLog.spec.ts).
vi.mock('@/lib/redirects/log', () => ({ logMissingPage: vi.fn(async () => undefined) }))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: () => unknown, key: string[], options: unknown) => {
    cacheCalls.push([key, options])
    return fn
  },
}))

/** The redirects the fake admin holds, and the one page they name. Obviously fake. */
const REDIRECTS = [
  {
    id: 1,
    from: '/about-us',
    to: { type: 'reference', reference: { relationTo: 'pages', value: 7 } },
    type: '308',
  },
  { id: 2, from: '/old-contact', to: { type: 'custom', url: '/about#contact' }, type: '307' },
  { id: 3, from: '/Old/Page.html', to: { type: 'custom', url: '/framework' }, type: '308' },
]

beforeEach(() => {
  find.mockReset()
  find.mockImplementation(async ({ collection }: { collection: string }) => ({
    docs: collection === 'redirects' ? REDIRECTS : [{ id: 7, slug: 'team' }],
  }))
  for (const fake of Object.values(navigation)) fake.mockClear()
  vi.mocked(logMissingPage).mockClear()
})

describe('the redirect table', () => {
  it('is cached until a redirect or a page changes, and read again every ten minutes', () => {
    expect(cacheCalls).toContainEqual([
      ['redirect-table'],
      { tags: [REDIRECTS_TAG, PAGES_TAG], revalidate: 600 },
    ])
  })

  it('holds every redirect, resolved to where it leads now', async () => {
    expect(await redirectTable()).toEqual([
      { from: '/about-us', to: '/team', status: '308' },
      { from: '/old-contact', to: '/about#contact', status: '307' },
      { from: '/Old/Page.html', to: '/framework', status: '308' },
    ])
  })
})

describe('the redirect from an address', () => {
  it('is found by the address as the log keeps it, case and all', async () => {
    expect(await redirectFor('/Old/Page.html')).toEqual({
      from: '/Old/Page.html',
      to: '/framework',
      status: '308',
    })
    expect(await redirectFor('/old/page.html')).toBeNull()
    expect(await redirectFor(null)).toBeNull()
  })

  it('sends a permanent move with 308 and a temporary one with 307', async () => {
    await expect(followRedirect('/about-us')).rejects.toThrow('fake 308 to /team')
    await expect(followRedirect('/old-contact')).rejects.toThrow('fake 307 to /about#contact')
  })

  it('lets the route answer as it would have when there is none', async () => {
    await expect(followRedirect('/no-redirect-here')).resolves.toBeUndefined()
    expect(navigation.redirect).not.toHaveBeenCalled()
    expect(navigation.permanentRedirect).not.toHaveBeenCalled()
  })

  it('comes before the 404, which is what is left', async () => {
    await expect(redirectOrNotFound('/about-us')).rejects.toThrow('fake 308 to /team')
    expect(navigation.notFound).not.toHaveBeenCalled()
    await expect(redirectOrNotFound('/no-redirect-here')).rejects.toThrow('fake not found')
    await expect(redirectOrNotFound(null)).rejects.toThrow('fake not found')
  })
})

describe('the 404 log (docs/11 §5.1, item 9)', () => {
  it('is written as the route answers with the 404, before it does', async () => {
    navigation.notFound.mockImplementationOnce(() => {
      // By the time the 404 is thrown, the address is on its way into the log.
      expect(logMissingPage).toHaveBeenCalledTimes(1)
      throw new Error('fake not found')
    })
    await expect(redirectOrNotFound('/no-redirect-here')).rejects.toThrow('fake not found')
    expect(navigation.notFound).toHaveBeenCalledTimes(1)
  })

  it('is not written for an address that is sent on: it has somewhere to go', async () => {
    await expect(redirectOrNotFound('/about-us')).rejects.toThrow('fake 308 to /team')
    await expect(redirectOrNotFound('/old-contact')).rejects.toThrow('fake 307 to /about#contact')
    await expect(followRedirect('/no-redirect-here')).resolves.toBeUndefined()
    expect(logMissingPage).not.toHaveBeenCalled()
  })
})
