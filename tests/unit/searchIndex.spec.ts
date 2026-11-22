// @vitest-environment node
import type {
  Access,
  CollectionAfterChangeHook,
  CollectionBeforeDeleteHook,
  CollectionConfig,
  Config,
  Field,
} from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { ROLES, type Role } from '@/access/roles'
import { SEARCH_INDEX, SEARCHED_COLLECTIONS } from '@/lib/search/kinds'
import { SEARCH_INDEX_ACCESS, searchIndex } from '@/plugins/searchIndex'

// The search index as Payload's search plugin builds it with IIIC's rules
// (src/plugins/searchIndex.ts): who reads and changes entries, what an entry holds when a
// document is published, and what never enters it. Obviously fake documents and requests.

const base = (slug: string, drafts: boolean): CollectionConfig => ({
  slug,
  fields: [],
  hooks: { afterChange: [({ doc }) => doc] },
  ...(drafts ? { versions: { drafts: true } } : {}),
})

const config = searchIndex()({
  collections: [
    base('pages', true),
    base('posts', true),
    base('faqs', true),
    base('services', false),
    base('topics', false),
  ],
} as unknown as Config) as Config
const collectionOf = (slug: string) =>
  config.collections?.find((collection) => collection.slug === slug) as CollectionConfig
const index = collectionOf(SEARCH_INDEX)

/** A request with a fake local API, recording what the plugin writes. */
function fakeRequest(published: unknown[] = []) {
  const payload = {
    config: {},
    logger: { error: vi.fn() },
    create: vi.fn(async ({ data }: { data: unknown }) => data),
    update: vi.fn(async ({ data }: { data: unknown }) => data),
    delete: vi.fn(async () => ({ docs: [] })),
    find: vi.fn(async ({ collection }: { collection: string }) => ({
      docs: collection === SEARCH_INDEX ? [] : published,
    })),
  }
  return {
    payload,
    context: {},
    user: null,
  } as unknown as Parameters<CollectionAfterChangeHook>[0]['req'] & { payload: typeof payload }
}

/** Every afterChange hook of a searched collection, as Payload runs them, in order. */
async function save(slug: string, doc: Record<string, unknown>, operation: 'create' | 'update') {
  const req = fakeRequest()
  const collection = collectionOf(slug)
  for (const hook of collection.hooks?.afterChange ?? []) {
    await hook({
      collection,
      context: {},
      data: doc,
      doc,
      operation,
      previousDoc: doc,
      req,
    } as unknown as Parameters<CollectionAfterChangeHook>[0])
  }
  return req.payload
}

const page = {
  id: 7,
  title: 'Fake page',
  slug: 'fake-page',
  description: 'A fake description.',
  layout: [{ blockType: 'statement', heading: 'Fake heading about the self' }],
  _status: 'published',
}

const service = {
  id: 9,
  name: 'Fake service',
  slug: 'fake-service',
  register: 'counselling',
  format: 'online',
  options: [{ duration: 30, price: 150000 }],
  sacCode: '999999',
  active: true,
}

describe('the search index collection', () => {
  it('is the plugin’s, named search-index (table search_index), with IIIC’s fields', () => {
    expect(index).toBeDefined()
    const names = (index.fields as Field[]).map((field) => ('name' in field ? field.name : null))
    expect(names).toEqual(['title', 'priority', 'doc', 'docUrl', 'url', 'excerpt', 'content'])
    expect(index.custom).toEqual({ totp: { disableAccessWrapper: { read: true } } })
  })

  it('is kept by hooks on the pages, services, articles and questions, and nothing else', () => {
    for (const slug of SEARCHED_COLLECTIONS) {
      const hooks = collectionOf(slug).hooks
      // The collection's own, the removal of hidden documents, then the plugin's sync.
      expect(hooks?.afterChange, slug).toHaveLength(3)
      expect(hooks?.beforeDelete, slug).toHaveLength(1)
    }
    expect(collectionOf('topics').hooks?.afterChange).toHaveLength(1)
    expect(collectionOf('topics').hooks?.beforeDelete).toBeUndefined()
  })

  it('lets anyone read it, the staff who edit content change it, owners and editors remove it', async () => {
    const access = index.access as Record<string, Access>
    expect(access.read).toBe(SEARCH_INDEX_ACCESS.read)
    const as = (role: Role | null) =>
      ({
        req: { user: role ? { id: 1, roles: [role], active: true, _strategy: 'totp' } : null },
      }) as Parameters<Access>[0]
    expect(await access.read!(as(null))).toBe(true)
    // Nobody adds an entry: only the plugin, past the access rules.
    expect(await access.create!(as('owner'))).toBe(false)
    expect(await access.create!(as(null))).toBe(false)
    for (const role of ROLES) {
      expect(await access.update!(as(role)), role).toBe(
        ['owner', 'operator', 'editor'].includes(role),
      )
      expect(await access.delete!(as(role)), role).toBe(['owner', 'editor'].includes(role))
    }
    expect(await access.update!(as(null))).toBe(false)
    expect(await access.delete!(as(null))).toBe(false)
  })

  it('keeps its words read-only: nobody writes them through the API', async () => {
    for (const name of ['title', 'url', 'excerpt', 'content']) {
      const field = (index.fields as Field[]).find(
        (candidate) => 'name' in candidate && candidate.name === name,
      ) as Field & { access?: { create?: () => boolean; update?: () => boolean } }
      expect(field.access?.create?.(), name).toBe(false)
      expect(field.access?.update?.(), name).toBe(false)
    }
  })
})

describe('an entry, as a document is saved', () => {
  it('is added for a published page, with its title, address, words and the page priority', async () => {
    const payload = await save('pages', page, 'create')
    expect(payload.create).toHaveBeenCalledTimes(1)
    expect(payload.create.mock.calls[0]?.[0]).toMatchObject({
      collection: SEARCH_INDEX,
      data: {
        doc: { relationTo: 'pages', value: 7 },
        title: 'Fake page',
        url: '/fake-page',
        excerpt: 'A fake description.',
        content: 'Fake page\nA fake description.\nFake heading about the self',
        priority: 40,
      },
    })
    expect(payload.delete).not.toHaveBeenCalled()
  })

  it('is never added for a draft', async () => {
    const payload = await save('pages', { ...page, _status: 'draft' }, 'create')
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('is removed, and never added, for a page published on a never-indexed route', async () => {
    const payload = await save('pages', { ...page, slug: 'book/fake' }, 'update')
    expect(payload.create).not.toHaveBeenCalled()
    expect(payload.update).not.toHaveBeenCalled()
    expect(payload.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: SEARCH_INDEX,
        where: { and: [{ 'doc.relationTo': { equals: 'pages' } }, { 'doc.value': { equals: 7 } }] },
      }),
    )
  })

  it('holds an offered service’s name and door, never its price, and goes when it is retired', async () => {
    const offered = await save('services', service, 'create')
    const data = offered.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }
    expect(data.data).toMatchObject({
      title: 'Fake service',
      url: '/counselling',
      excerpt: 'Counselling · Online',
      priority: 30,
    })
    expect(JSON.stringify(data)).not.toMatch(/150000|999999/)
    const retired = await save('services', { ...service, active: false }, 'update')
    expect(retired.create).not.toHaveBeenCalled()
    expect(retired.update).not.toHaveBeenCalled()
    expect(retired.delete).toHaveBeenCalledTimes(1)
  })

  it('is removed with its document', async () => {
    const req = fakeRequest()
    const [hook] = collectionOf('faqs').hooks?.beforeDelete ?? []
    await hook!({
      collection: collectionOf('faqs'),
      context: {},
      id: 3,
      req,
    } as unknown as Parameters<CollectionBeforeDeleteHook>[0])
    expect(req.payload.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: SEARCH_INDEX,
        where: { 'doc.relationTo': { equals: 'faqs' }, 'doc.value': { equals: 3 } },
      }),
    )
  })
})
