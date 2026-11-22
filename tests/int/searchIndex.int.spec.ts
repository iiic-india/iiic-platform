import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Page, User } from '@/payload-types'
import config from '@/payload.config'

// The search index against the real database (docs/04 `search_index`; docs/11 §5.3;
// src/plugins/searchIndex.ts): a visitor reads only entries for what is published, never a
// draft, a page on a never-indexed route or a service that is not offered; nobody adds an entry
// through the API; the staff who edit content change one only with their two-factor code.
// Obviously fake accounts and content.
let payload: Payload
const email = (label: string) => `int.search.${label}@example.invalid`
const ROLES = ['owner', 'editor', 'operator', 'practitioner'] as const
const PASSWORD = 'test-only-password-search'
const staff = {} as Record<(typeof ROLES)[number], User>
/** A staff user as Payload sees them after they entered their two-factor code. */
const verified = (user: User) => ({ ...user, _strategy: 'totp' }) as User
/** The same user with only their password entered. */
const passwordOnly = (user: User) => ({ ...user, _strategy: 'local-jwt' }) as User

/** Every address this file creates a page at; the cleanup deletes exactly these. */
const SLUG = {
  published: 'int-search-published',
  draft: 'int-search-draft',
  lifecycle: 'int-search-lifecycle',
  hidden: 'book/int-search-hidden',
} as const
const SERVICE = 'int-search-service'
const QUESTION = 'int.search. A fake question about zzintsearch?'

const hero = (heading: string) => ({
  blockType: 'hero' as const,
  heading,
  copyStatus: 'approved' as const,
})

async function removeTestData() {
  await payload.delete({ collection: 'pages', where: { slug: { in: Object.values(SLUG) } } })
  await payload.delete({ collection: 'faqs', where: { question: { like: 'int.search.' } } })
  await payload.delete({ collection: 'services', where: { slug: { equals: SERVICE } } })
  await payload.delete({ collection: 'users', where: { email: { like: 'int.search.' } } })
}

/** The entries a visitor reads for a document: no sign-in, access rules applied. */
async function visitorEntries(kind: 'pages' | 'faqs' | 'services', id: number) {
  const { docs } = await payload.find({
    collection: 'search-index',
    where: { and: [{ 'doc.relationTo': { equals: kind } }, { 'doc.value': { equals: id } }] },
    overrideAccess: false,
    depth: 0,
  })
  return docs
}

function publishPage(slug: string, heading: string, layout?: Page['layout']) {
  return payload.create({
    collection: 'pages',
    data: {
      title: 'Fake search page',
      slug,
      layout: layout ?? [hero(heading)],
      _status: 'published',
    },
  })
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  // The owner first: on an empty table the first account becomes the owner anyway.
  for (const role of ROLES) {
    staff[role] = await payload.create({
      collection: 'users',
      data: { name: `Fake ${role}`, email: email(role), password: PASSWORD, roles: [role] },
    })
  }
})

afterAll(async () => {
  await removeTestData()
})

describe('the search index (docs/04 search_index)', () => {
  it('holds a published page’s words for a visitor, and nothing of a draft', async () => {
    const published = await publishPage(SLUG.published, 'Fake heading zzintsearchpublished')
    const [entry] = await visitorEntries('pages', published.id)
    expect(entry).toMatchObject({
      title: 'Fake search page',
      url: `/${SLUG.published}`,
      priority: 40,
    })
    expect(entry?.content).toContain('zzintsearchpublished')

    const draft = await payload.create({
      collection: 'pages',
      data: {
        title: 'Fake draft',
        slug: SLUG.draft,
        layout: [hero('zzintsearchdraft')],
        _status: 'draft',
      },
      draft: true,
    })
    expect(await visitorEntries('pages', draft.id)).toHaveLength(0)
    // Payload's like finds the published words, and no draft's.
    const found = await payload.find({
      collection: 'search-index',
      where: { content: { like: 'zzintsearchdraft' } },
      overrideAccess: false,
    })
    expect(found.totalDocs).toBe(0)
  })

  it('follows a page as it is published, drafted again, published and unpublished', async () => {
    const page = await payload.create({
      collection: 'pages',
      data: {
        title: 'Fake lifecycle',
        slug: SLUG.lifecycle,
        layout: [hero('zzfirstwords')],
        _status: 'draft',
      },
      draft: true,
    })
    expect(await visitorEntries('pages', page.id)).toHaveLength(0)

    await payload.update({ collection: 'pages', id: page.id, data: { _status: 'published' } })
    expect((await visitorEntries('pages', page.id))[0]?.content).toContain('zzfirstwords')

    // A new draft over the published page leaves the published words in the index.
    await payload.update({
      collection: 'pages',
      id: page.id,
      data: { layout: [hero('zzdraftwords')], _status: 'draft' },
      draft: true,
    })
    const [kept] = await visitorEntries('pages', page.id)
    expect(kept?.content).toContain('zzfirstwords')
    expect(kept?.content).not.toContain('zzdraftwords')

    await payload.update({
      collection: 'pages',
      id: page.id,
      data: { layout: [hero('zzsecondwords')], _status: 'published' },
    })
    expect((await visitorEntries('pages', page.id))[0]?.content).toContain('zzsecondwords')

    // Unpublished: the entry goes.
    await payload.update({ collection: 'pages', id: page.id, data: { _status: 'draft' } })
    expect(await visitorEntries('pages', page.id)).toHaveLength(0)
  })

  it('holds nothing for a page published on a never-indexed route', async () => {
    const hidden = await publishPage(SLUG.hidden, 'Fake hidden heading')
    expect(await visitorEntries('pages', hidden.id)).toHaveLength(0)
  })

  it('holds a published question, which leads to its page, and no draft one', async () => {
    const draft = await payload.create({
      collection: 'faqs',
      data: { question: QUESTION, answer: 'A fake answer.', page: 'counselling', order: 1 },
      draft: true,
    })
    expect(await visitorEntries('faqs', draft.id)).toHaveLength(0)
    await payload.update({ collection: 'faqs', id: draft.id, data: { _status: 'published' } })
    const [entry] = await visitorEntries('faqs', draft.id)
    expect(entry).toMatchObject({ title: QUESTION, url: '/counselling', priority: 10 })
  })

  it('holds an offered service’s name and door, never its price, until it is retired', async () => {
    const service = await payload.create({
      collection: 'services',
      data: {
        name: 'Fake search service',
        slug: SERVICE,
        type: 'session',
        register: 'counselling',
        format: 'online',
        options: [{ label: 'Fake option', duration: 30, price: 150000, gstInclusive: true }],
        sacCode: '999999',
        active: false,
      },
    })
    expect(await visitorEntries('services', service.id)).toHaveLength(0)

    await payload.update({ collection: 'services', id: service.id, data: { active: true } })
    const [entry] = await visitorEntries('services', service.id)
    expect(entry).toMatchObject({
      title: 'Fake search service',
      url: '/counselling',
      excerpt: 'Counselling · Online',
    })
    expect(JSON.stringify(entry)).not.toMatch(/150000|999999/)

    await payload.update({ collection: 'services', id: service.id, data: { active: false } })
    expect(await visitorEntries('services', service.id)).toHaveLength(0)
  })

  it('takes no entry from anyone through the API, and no change without the code', async () => {
    const page = await payload.find({
      collection: 'pages',
      where: { slug: { equals: SLUG.published } },
    })
    const [entry] = await visitorEntries('pages', page.docs[0]!.id)
    expect(entry).toBeDefined()

    // Nobody adds an entry: not a visitor, not an owner with the code.
    for (const user of [undefined, verified(staff.owner)]) {
      await expect(
        payload.create({
          collection: 'search-index',
          data: { title: 'Fake', doc: { relationTo: 'pages', value: page.docs[0]!.id } },
          user,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    }

    const change = (user: User | undefined, priority: number) =>
      payload.update({
        collection: 'search-index',
        id: entry!.id,
        data: { priority },
        user,
        overrideAccess: false,
      })
    await expect(change(undefined, 99)).rejects.toThrow()
    await expect(change(verified(staff.practitioner), 99)).rejects.toThrow()
    await expect(change(passwordOnly(staff.editor), 99)).rejects.toThrow()
    expect((await change(verified(staff.operator), 41)).priority).toBe(41)

    // Its words come from the page: a change to them through the API is not kept.
    const words = await payload.update({
      collection: 'search-index',
      id: entry!.id,
      data: { title: 'Fake new title', content: 'zzinjected' },
      user: verified(staff.editor),
      overrideAccess: false,
    })
    expect(words.title).toBe('Fake search page')
    expect(words.content).not.toContain('zzinjected')

    const remove = (user: User | undefined) =>
      payload.delete({
        collection: 'search-index',
        id: entry!.id,
        user,
        overrideAccess: false,
      })
    await expect(remove(undefined)).rejects.toThrow()
    await expect(remove(verified(staff.operator))).rejects.toThrow()
    await remove(verified(staff.editor))
    expect(await visitorEntries('pages', page.docs[0]!.id)).toHaveLength(0)
  })
})
