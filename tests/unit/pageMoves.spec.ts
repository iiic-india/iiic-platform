// @vitest-environment node
import { APIError } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { Pages } from '@/collections/Pages'
import { CHAIN_MESSAGES } from '@/lib/redirects/chains'
import { noteAddressChange, redirectOldAddress } from '@/lib/redirects/pageMoves'

// A published page's old address keeps working (src/lib/redirects/pageMoves.ts; docs/12 §3;
// D-57), through the Pages hooks, against a fake Payload: the page's own row (the address the
// site served), the redirects, and the writes the hooks make.

type Row = { id: number; slug: string; _status: 'draft' | 'published'; firstPublishedAt?: string }
type StoredRedirect = { id: number; from: string; to: object; type: '307' | '308' }

const PAGE_ID = 7

function fakeRequest(row: Row | null, redirects: StoredRedirect[], slugs: Record<number, string>) {
  const payload = {
    db: { findOne: vi.fn(async () => row) },
    find: vi.fn(async ({ collection }: { collection: string }) => ({
      docs:
        collection === 'redirects'
          ? redirects
          : Object.entries(slugs).map(([id, slug]) => ({ id: Number(id), slug })),
    })),
    create: vi.fn(async ({ data }: { data: object }) => ({ id: 99, ...data })),
    update: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
  }
  return { payload, req: { payload } }
}

/** Runs the two hooks as Payload does around one save, sharing the operation's context. */
async function save(
  row: Row | null,
  data: { slug: string; _status: 'draft' | 'published' },
  redirects: StoredRedirect[] = [],
  operation: 'create' | 'update' = 'update',
) {
  const { payload, req } = fakeRequest(row, redirects, { [PAGE_ID]: data.slug })
  const context: Record<string, unknown> = {}
  await noteAddressChange({
    context,
    data: { ...data },
    operation,
    originalDoc: operation === 'update' ? { id: PAGE_ID } : undefined,
    req,
  } as never)
  await redirectOldAddress({ context, doc: { id: PAGE_ID, ...data }, req } as never)
  return { payload, context }
}

const live = (slug: string): Row => ({ id: PAGE_ID, slug, _status: 'published' })
const toPage = { type: 'reference', reference: { relationTo: 'pages', value: PAGE_ID } }

describe('publishing a page at a new address', () => {
  it('redirects the old address to the page itself, permanently, in the same request', async () => {
    const { payload, context } = await save(live('about'), { slug: 'team', _status: 'published' })
    expect(payload.create).toHaveBeenCalledTimes(1)
    expect(payload.create).toHaveBeenCalledWith({
      collection: 'redirects',
      data: { from: '/about', to: toPage, type: '308' },
      overrideAccess: true,
      req: expect.objectContaining({ payload }),
    })
    // The page's live address is read from its own row, in the request's transaction.
    expect(payload.db.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'pages', where: { id: { equals: PAGE_ID } } }),
    )
    // The note is used once and gone.
    expect(context).toEqual({})
  })

  it('does so for a page that was published, unpublished and is now published elsewhere', async () => {
    const unpublished: Row = {
      id: PAGE_ID,
      slug: 'about',
      _status: 'draft',
      firstPublishedAt: '2026-11-20T10:00:00.000Z',
    }
    const { payload } = await save(unpublished, { slug: 'team', _status: 'published' })
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { from: '/about', to: toPage, type: '308' } }),
    )
  })

  it('re-points a redirect that named the old address, and leaves one to the page alone', async () => {
    const { payload } = await save(live('about'), { slug: 'team', _status: 'published' }, [
      { id: 1, from: '/old-contact', to: { type: 'custom', url: '/about#contact' }, type: '308' },
      { id: 2, from: '/older', to: toPage, type: '308' },
    ])
    expect(payload.update).toHaveBeenCalledTimes(1)
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'redirects',
        id: 1,
        data: { to: { type: 'custom', url: '/team#contact' } },
        overrideAccess: true,
      }),
    )
    expect(payload.create).toHaveBeenCalledTimes(1)
  })

  it('back where it was before removes the redirect from there, so nothing loops', async () => {
    const { payload } = await save(live('team'), { slug: 'about', _status: 'published' }, [
      { id: 1, from: '/about', to: toPage, type: '308' },
    ])
    expect(payload.delete).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'redirects', id: 1, overrideAccess: true }),
    )
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { from: '/team', to: toPage, type: '308' } }),
    )
  })

  it('is refused for the home page, whose address cannot redirect', async () => {
    const error = await save(live('home'), { slug: 'welcome', _status: 'published' }).catch(
      (thrown: unknown) => thrown,
    )
    expect(error).toBeInstanceOf(APIError)
    expect((error as APIError).message).toBe(CHAIN_MESSAGES.home)
    expect((error as APIError).status).toBe(400)
  })
})

describe('everything else a page does', () => {
  it('published where it was: only a redirect made from its address while it was away goes', async () => {
    const { payload } = await save(live('about'), { slug: 'about', _status: 'published' }, [
      { id: 1, from: '/about', to: { type: 'custom', url: '/framework' }, type: '307' },
    ])
    expect(payload.delete).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('published for the first time: no old address, no redirect', async () => {
    const draft: Row = { id: PAGE_ID, slug: 'about', _status: 'draft' }
    const { payload } = await save(draft, { slug: 'team', _status: 'published' })
    expect(payload.create).not.toHaveBeenCalled()
    const created = await save(null, { slug: 'team', _status: 'published' }, [], 'create')
    expect(created.payload.db.findOne).not.toHaveBeenCalled()
    expect(created.payload.create).not.toHaveBeenCalled()
  })

  it('a draft saved at a new address changes nothing until it is published', async () => {
    const { payload } = await save(live('about'), { slug: 'team', _status: 'draft' })
    expect(payload.db.findOne).not.toHaveBeenCalled()
    expect(payload.find).not.toHaveBeenCalled()
    expect(payload.create).not.toHaveBeenCalled()
  })
})

describe('the Pages collection', () => {
  it('notes the move before the save and moves the redirects after it, before revalidating', () => {
    expect(Pages.hooks?.beforeChange).toContain(noteAddressChange)
    expect(Pages.hooks?.afterChange?.[0]).toBe(redirectOldAddress)
  })
})
