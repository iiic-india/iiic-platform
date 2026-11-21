// @vitest-environment node
import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import {
  finalTarget,
  MAX_HOPS,
  readRedirects,
  referencedPage,
  resolveTarget,
  type Rule,
  targetOf,
} from '@/lib/redirects/table'

// The redirects as the site follows them (src/lib/redirects/table.ts): each stored redirect
// resolved to an address, a page's by reference wherever the page lives now.

const SLUGS = new Map([
  ['7', 'team'],
  ['8', 'home'],
])

describe('where a stored redirect leads', () => {
  it('is the page’s address, by reference, wherever the page lives now', () => {
    const to = { type: 'reference' as const, reference: { relationTo: 'pages', value: 7 } }
    expect(referencedPage(to)).toBe(7)
    expect(resolveTarget(to, SLUGS)).toBe('/team')
    // Populated, as a read at depth 1 hands it.
    expect(
      resolveTarget(
        { type: 'reference', reference: { relationTo: 'pages', value: { id: 8 } } },
        SLUGS,
      ),
    ).toBe('/')
    // The plugin's default kind is a page.
    expect(resolveTarget({ reference: { relationTo: 'pages', value: 7 } }, SLUGS)).toBe('/team')
  })

  it('is the address given, for a redirect to an address', () => {
    const to = { type: 'custom' as const, url: '/about#contact', reference: null }
    expect(referencedPage(to)).toBeUndefined()
    expect(resolveTarget(to, SLUGS)).toBe('/about#contact')
  })

  it('is nowhere when its page was deleted or no address was given', () => {
    expect(resolveTarget({ type: 'reference', reference: null }, SLUGS)).toBeNull()
    expect(
      resolveTarget({ type: 'reference', reference: { relationTo: 'pages', value: 99 } }, SLUGS),
    ).toBeNull()
    expect(resolveTarget({ type: 'custom', url: '' }, SLUGS)).toBeNull()
    expect(resolveTarget(undefined, SLUGS)).toBeNull()
  })
})

/** A fake Payload holding redirects and the pages they name. Obviously fake. */
function fakePayload(redirects: unknown[], pages: { id: number; slug: string }[]) {
  const find = vi.fn(async ({ collection }: { collection: string }) => ({
    docs: collection === 'redirects' ? redirects : pages,
  }))
  return { payload: { find } as unknown as Payload, find }
}

describe('every redirect, resolved', () => {
  it('reads them past the access rules, with a limit, and the pages they name by id', async () => {
    const { payload, find } = fakePayload(
      [
        {
          id: 1,
          from: '/about-us',
          to: { type: 'reference', reference: { relationTo: 'pages', value: 7 } },
          type: '308',
        },
        { id: 2, from: '/old-contact', to: { type: 'custom', url: '/about#contact' }, type: '307' },
        { id: 3, from: '/gone', to: { type: 'reference', reference: null }, type: '308' },
      ],
      [{ id: 7, slug: 'team' }],
    )
    expect(await readRedirects(payload)).toEqual<Rule[]>([
      { id: 1, from: '/about-us', to: '/team', status: '308', pageId: 7 },
      { id: 2, from: '/old-contact', to: '/about#contact', status: '307' },
    ])
    expect(find).toHaveBeenNthCalledWith(1, {
      collection: 'redirects',
      limit: 2000,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: { from: true, to: true, type: true },
      req: undefined,
    })
    expect(find).toHaveBeenNthCalledWith(2, {
      collection: 'pages',
      where: { id: { in: ['7'] } },
      limit: 1,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: { slug: true },
      req: undefined,
    })
  })

  it('asks for no page when none is named', async () => {
    const { payload, find } = fakePayload(
      [{ id: 2, from: '/old', to: { type: 'custom', url: '/about' }, type: '308' }],
      [],
    )
    expect(await readRedirects(payload)).toHaveLength(1)
    expect(find).toHaveBeenCalledTimes(1)
    expect(await targetOf({ type: 'custom', url: '/about' }, payload)).toBe('/about')
  })
})

describe('where an address leads in the end', () => {
  const table = (rules: [string, string][]) =>
    new Map(rules.map(([from, to]) => [from, { to, status: '308' as const }]))

  it('is where its redirect leads, in one step', () => {
    expect(finalTarget('/old', table([['/old', '/about#team']]))).toEqual({
      to: '/about#team',
      status: '308',
    })
  })

  it('is nothing for an address with no redirect', () => {
    expect(finalTarget('/about', table([['/old', '/about']]))).toBeNull()
  })

  it('follows a chain to its end, so the visitor is sent once', () => {
    const chain = table([
      ['/a', '/b'],
      ['/b', '/c#section'],
      ['/c', '/d'],
    ])
    expect(finalTarget('/a', chain)?.to).toBe('/d')
    expect(finalTarget('/b', chain)?.to).toBe('/d')
  })

  it('keeps the first redirect’s kind', () => {
    const rules = new Map([
      ['/a', { to: '/b', status: '307' as const }],
      ['/b', { to: '/c', status: '308' as const }],
    ])
    expect(finalTarget('/a', rules)).toEqual({ to: '/c', status: '307' })
  })

  it('is nothing for a loop, which would send the browser round for ever', () => {
    expect(finalTarget('/a', table([['/a', '/a#top']]))).toBeNull()
    expect(
      finalTarget(
        '/a',
        table([
          ['/a', '/b'],
          ['/b', '/a'],
        ]),
      ),
    ).toBeNull()
    expect(
      finalTarget(
        '/a',
        table([
          ['/a', '/b'],
          ['/b', '/c'],
          ['/c', '/b'],
        ]),
      ),
    ).toBeNull()
  })

  it('gives up past the most steps it follows', () => {
    const long = table(
      Array.from({ length: MAX_HOPS + 1 }, (_, step): [string, string] => [
        `/${step}`,
        `/${step + 1}`,
      ]),
    )
    expect(finalTarget('/0', long)).toBeNull()
    expect(finalTarget('/1', long)?.to).toBe(`/${MAX_HOPS + 1}`)
  })
})
