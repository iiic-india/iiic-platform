// @vitest-environment node
import type {
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  Config,
  Field,
  GroupField,
  SelectField,
  TextField,
} from 'payload'
import { ValidationError } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { REDIRECT_MESSAGES, redirects } from '@/collections/Redirects'
import { CHAIN_MESSAGES } from '@/lib/redirects/chains'
import { PAGE_MOVE_REDIRECT } from '@/lib/redirects/pageMoves'
import { revalidateRedirects } from '@/lib/redirects/revalidate'

vi.mock('@/lib/redirects/revalidate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/redirects/revalidate')>()),
  revalidateRedirects: vi.fn(),
}))

// The redirects collection as Payload's redirects plugin builds it with IIIC's overrides
// (src/collections/Redirects.ts): where an old address may lead, the kinds of redirect, and the
// checks a save passes. The roles are held to docs/05 in tests/unit/policy.spec.ts.

const config = redirects({ collections: [] } as unknown as Config) as Config
const collection = config.collections?.find(({ slug }) => slug === 'redirects') as CollectionConfig

const named = <T extends Field>(fields: Field[], name: string) =>
  fields.find((field) => 'name' in field && field.name === name) as T

const from = named<TextField>(collection.fields, 'from')
const to = named<GroupField>(collection.fields, 'to')
const url = named<TextField>(to.fields, 'url')
const kind = named<SelectField>(collection.fields, 'type')

/** A field's validation as Payload runs it on a save. */
const validate = (field: TextField, value: unknown, data: object = {}) =>
  (field.validate as (value: unknown, options: object) => Promise<true | string>)(value, {
    data,
    siblingData: data,
    req: { payload: { config: {} }, t: (key: string) => key },
    required: field.required,
  })

describe('the redirects collection', () => {
  it('is the plugin’s, in the Content group, with pages as what it may lead to', () => {
    expect(collection.admin?.group).toBe('Content')
    expect(collection.admin?.useAsTitle).toBe('from')
    const reference = named<Field & { relationTo: unknown }>(to.fields, 'reference')
    expect(reference.relationTo).toEqual(['pages'])
  })

  it('offers the two kinds a page can send, permanent first', () => {
    expect(
      kind.options.map((option) => (typeof option === 'string' ? option : option.value)),
    ).toEqual(['308', '307'])
    expect(kind.defaultValue).toBe('308')
    expect(kind.required).toBe(true)
  })

  it('keeps an old address only as a path on this site the site does not answer itself', async () => {
    expect(await validate(from, '/about-us')).toBe(true)
    expect(await validate(from, '/Old/Page.html')).toBe(true)
    expect(await validate(from, 'about-us')).toBe(REDIRECT_MESSAGES.from)
    expect(await validate(from, '/about-us/')).toBe(REDIRECT_MESSAGES.from)
    expect(await validate(from, '/about?x=1')).toBe(REDIRECT_MESSAGES.from)
    for (const path of ['/', '/admin', '/api/health', '/map', '/.well-known/security.txt']) {
      expect(await validate(from, path), path).toBe(REDIRECT_MESSAGES.answered)
    }
    // Payload's own check still runs first.
    expect(await validate(from, '')).not.toBe(true)
  })

  it('sends visitors only to an address on this site, never another site', async () => {
    expect(await validate(url, '/about#contact', { type: 'custom' })).toBe(true)
    for (const bad of ['https://evil.example', '//evil.example', '/About', '/about?x=1']) {
      expect(await validate(url, bad, { type: 'custom' }), bad).toBe(REDIRECT_MESSAGES.to)
    }
  })

  it('reads the addresses as typed into one form before checking them', async () => {
    const tidy = collection.hooks?.beforeValidate?.[0] as CollectionBeforeValidateHook
    const data = { from: ' about%2Dus/ ', to: { type: 'custom', url: ' about#team ' } }
    expect(await tidy({ data } as never)).toEqual({
      from: '/about-us',
      to: { type: 'custom', url: '/about#team' },
    })
  })

  it('marks the cached redirects stale whenever one changes or goes', async () => {
    await collection.hooks?.afterChange?.[0]?.({ doc: {} } as never)
    await collection.hooks?.afterDelete?.[0]?.({ doc: {} } as never)
    expect(revalidateRedirects).toHaveBeenCalledTimes(2)
  })
})

describe('a save checked against the other redirects and the pages', () => {
  const check = collection.hooks?.beforeChange?.[0] as CollectionBeforeChangeHook
  const find = vi.fn()
  const count = vi.fn()
  const req = { payload: { find, count } }

  /** The redirects already held, and the pages: page 7 lives at /team. Obviously fake. */
  function holds(stored: object[], publishedAtFrom = 0) {
    find.mockImplementation(async ({ collection: slug }: { collection: string }) => ({
      docs: slug === 'redirects' ? stored : [{ id: 7, slug: 'team' }],
    }))
    count.mockResolvedValue({ totalDocs: publishedAtFrom })
  }

  /** The errors a refused save names, by field. */
  async function refusal(
    data: object,
    operation: 'create' | 'update' = 'create',
    id?: number,
    context: Record<string, unknown> = {},
  ) {
    try {
      await check({
        context,
        data,
        operation,
        originalDoc: id === undefined ? undefined : { id, from: '/before' },
        req,
      } as never)
      return null
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError)
      return (error as ValidationError).data.errors
    }
  }

  beforeEach(() => {
    find.mockReset()
    count.mockReset()
    holds([])
  })

  it('passes a redirect straight to a page, by address or by reference', async () => {
    expect(await refusal({ from: '/old', to: { type: 'custom', url: '/about' } })).toBeNull()
    expect(
      await refusal({
        from: '/old',
        to: { type: 'reference', reference: { relationTo: 'pages', value: 7 } },
      }),
    ).toBeNull()
  })

  it('refuses one that leads back to its own address, by address or by its page', async () => {
    expect(
      await refusal({ from: '/fake-about', to: { type: 'custom', url: '/fake-about#team' } }),
    ).toEqual([{ path: 'to.url', message: CHAIN_MESSAGES.self }])
    expect(
      await refusal({
        from: '/team',
        to: { type: 'reference', reference: { relationTo: 'pages', value: 7 } },
      }),
    ).toEqual(expect.arrayContaining([{ path: 'to.reference', message: CHAIN_MESSAGES.self }]))
  })

  it('refuses a chain, either way round', async () => {
    holds([{ id: 1, from: '/old-about', to: { type: 'custom', url: '/fake-about' }, type: '308' }])
    expect(await refusal({ from: '/x', to: { type: 'custom', url: '/old-about' } })).toEqual([
      { path: 'to.url', message: CHAIN_MESSAGES.onward('/old-about', '/fake-about') },
    ])
    expect(
      await refusal({ from: '/fake-about', to: { type: 'custom', url: '/framework' } }),
    ).toEqual([{ path: 'from', message: CHAIN_MESSAGES.inward('/fake-about', '/old-about') }])
  })

  it('refuses one to a page that no longer exists', async () => {
    expect(
      await refusal({
        from: '/old',
        to: { type: 'reference', reference: { relationTo: 'pages', value: 99 } },
      }),
    ).toEqual([{ path: 'to.reference', message: REDIRECT_MESSAGES.page }])
  })

  it('refuses a new one from an address where a page is published', async () => {
    holds([], 1)
    expect(await refusal({ from: '/framework', to: { type: 'custom', url: '/about' } })).toEqual([
      { path: 'from', message: REDIRECT_MESSAGES.published('/framework') },
    ])
    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'pages',
        where: { and: [{ slug: { equals: 'framework' } }, { _status: { equals: 'published' } }] },
      }),
    )
    // The home page lives at "/", so "/home" is an address like any other.
    count.mockClear()
    expect(await refusal({ from: '/home', to: { type: 'custom', url: '/' } })).toBeNull()
    expect(count).not.toHaveBeenCalled()
  })

  it('refuses a new one from an address that still shows its starter page (D-57)', async () => {
    // No page at /privacy is published, and none has ever been: its starter page is shown.
    expect(await refusal({ from: '/privacy', to: { type: 'custom', url: '/about' } })).toEqual([
      { path: 'from', message: REDIRECT_MESSAGES.starter('/privacy') },
    ])
    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'pages',
        where: { and: [{ slug: { equals: 'privacy' } }, { firstPublishedAt: { exists: true } }] },
      }),
    )
    // An address with no starter page asks only whether a page is published there.
    count.mockClear()
    expect(await refusal({ from: '/old', to: { type: 'custom', url: '/about' } })).toBeNull()
    expect(count).toHaveBeenCalledTimes(1)
  })

  it('lets a redirect start where a starter page is no longer shown', async () => {
    // A page was published at /privacy once and is unpublished now: the address is the 404.
    count.mockImplementation(async ({ where }: { where: { and: object[] } }) => ({
      totalDocs: JSON.stringify(where).includes('firstPublishedAt') ? 1 : 0,
    }))
    expect(await refusal({ from: '/privacy', to: { type: 'custom', url: '/about' } })).toBeNull()
  })

  it('lets only the moved page’s own redirect go before a starter page', async () => {
    const moved = { [PAGE_MOVE_REDIRECT]: '/founders' }
    const data = { from: '/founders', to: { type: 'custom', url: '/about' } }
    expect(await refusal(data, 'create', undefined, moved)).toBeNull()
    // The flag names one address; it lets no other through.
    expect(await refusal({ ...data, from: '/privacy' }, 'create', undefined, moved)).toEqual([
      { path: 'from', message: REDIRECT_MESSAGES.starter('/privacy') },
    ])
  })

  it('refuses one more past the most the site reads', async () => {
    holds(
      Array.from({ length: 2000 }, (_, index) => ({
        id: index + 1,
        from: `/old-${index}`,
        to: { type: 'custom', url: '/about' },
        type: '308',
      })),
    )
    expect(await refusal({ from: '/one-more', to: { type: 'custom', url: '/about' } })).toEqual([
      { path: 'from', message: REDIRECT_MESSAGES.full },
    ])
    // Changing one of them is still allowed.
    expect(
      await refusal({ from: '/old-0', to: { type: 'custom', url: '/framework' } }, 'update', 1),
    ).toBeNull()
  })
})
