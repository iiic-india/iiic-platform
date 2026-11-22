import { buildEditorState } from '@payloadcms/richtext-lexical'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Post, Topic, User } from '@/payload-types'
import config from '@/payload.config'

// The Journal against the real database (docs/04 posts and topics; docs/05 Content): who reads
// what, who writes, and what an article must hold to be published. A draft is never public.
// Obviously fake accounts and content; every address this file uses starts with
// "int-journal-", which the cleanup deletes and nothing else.
let payload: Payload
const email = (label: string) => `int.journal.${label}@example.invalid`
const ROLES = ['owner', 'operator', 'editor', 'practitioner', 'finance'] as const
type StaffRole = (typeof ROLES)[number]
const PASSWORD = 'test-only-password-journal'
/** A staff user as Payload sees them after they entered their two-factor code. */
const verified = (user: User) => ({ ...user, _strategy: 'totp' }) as User
const staff = {} as Record<StaffRole, User>
const PREFIX = 'int-journal-'
let topic: Topic

/** A body of so many fake words. */
const body = (words = 12) =>
  buildEditorState({ text: Array.from({ length: words }, () => 'fake').join(' ') })

/** Everything an article needs to be published, at an address of this file's. */
const complete = (slug: string): Partial<Post> => ({
  title: 'A fake question?',
  slug: `${PREFIX}${slug}`,
  excerpt: 'A fake excerpt that answers the fake question.',
  body: body() as Post['body'],
  question: 'What would a fake reader carry home?',
  topics: [topic.id],
  author: 'founder',
})

async function removeTestData() {
  // Articles first: a topic with articles filed under it stays (src/collections/Topics.ts).
  await payload.delete({ collection: 'posts', where: { slug: { like: PREFIX } } })
  await payload.delete({ collection: 'topics', where: { slug: { like: PREFIX } } })
  await payload.delete({ collection: 'users', where: { email: { in: ROLES.map(email) } } })
}

/** Publishes an article at once, with the fields given over the complete ones. */
function publish(slug: string, fields: Partial<Post> = {}) {
  return payload.create({
    collection: 'posts',
    data: { ...complete(slug), ...fields, _status: 'published' } as Post,
  })
}

/** What a visitor finds at an address: no sign-in, access rules applied. */
async function visitorFinds(slug: string, draft = false) {
  const found = await payload.find({
    collection: 'posts',
    where: { slug: { equals: `${PREFIX}${slug}` } },
    overrideAccess: false,
    draft,
  })
  return found.docs
}

/** The fields a refused save names, each with its message (Payload's ValidationError). */
function refusedFields(error: unknown): { path?: string; message?: string }[] {
  return (error as { data?: { errors?: [] } } | null)?.data?.errors ?? []
}

const refusal = (attempt: Promise<unknown>) =>
  attempt.then(
    () => null,
    (error: unknown) => error,
  )

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
  topic = await payload.create({
    collection: 'topics',
    data: { name: 'Fake topic', slug: `${PREFIX}topic`, door: 'framework' },
  })
})

afterAll(async () => {
  await removeTestData()
})

describe('articles', () => {
  it('show a visitor an article only once it is published, and never a draft', async () => {
    const draft = await payload.create({
      collection: 'posts',
      // A draft may be incomplete: no question, no excerpt yet.
      data: { title: 'A fake draft?', slug: `${PREFIX}draft-then-published`, _status: 'draft' },
      draft: true,
      user: verified(staff.editor),
      overrideAccess: false,
    })
    expect(await visitorFinds('draft-then-published')).toEqual([])
    expect(await visitorFinds('draft-then-published', true)).toEqual([])

    await payload.update({
      collection: 'posts',
      id: draft.id,
      data: { ...complete('draft-then-published'), _status: 'published' },
      user: verified(staff.editor),
      overrideAccess: false,
    })
    expect((await visitorFinds('draft-then-published')).map(({ title }) => title)).toEqual([
      'A fake question?',
    ])

    // A newer draft on top of the published article stays with the staff.
    await payload.update({
      collection: 'posts',
      id: draft.id,
      data: { title: 'A fake unpublished change?' },
      draft: true,
      user: verified(staff.editor),
      overrideAccess: false,
    })
    for (const read of [false, true]) {
      const titles = (await visitorFinds('draft-then-published', read)).map(({ title }) => title)
      expect(titles, `draft: ${read}`).not.toContain('A fake unpublished change?')
    }

    // An unpublish takes it off the site.
    await payload.update({
      collection: 'posts',
      id: draft.id,
      data: { _status: 'draft' },
      user: verified(staff.editor),
      overrideAccess: false,
    })
    expect(await visitorFinds('draft-then-published')).toEqual([])
  })

  it('let the staff who edit content read drafts and earlier versions once they have entered their code, and no other staff', async () => {
    const draft = await payload.create({
      collection: 'posts',
      data: { title: 'A fake draft?', slug: `${PREFIX}draft-readers`, _status: 'draft' },
      draft: true,
    })
    const asStaff = async (user: User) =>
      (
        await payload.find({
          collection: 'posts',
          where: { slug: { equals: `${PREFIX}draft-readers` } },
          user,
          overrideAccess: false,
          draft: true,
        })
      ).totalDocs
    for (const role of ['owner', 'operator', 'editor'] as const) {
      expect(await asStaff(verified(staff[role])), role).toBe(1)
    }
    for (const role of ['practitioner', 'finance'] as const) {
      expect(await asStaff(verified(staff[role])), role).toBe(0)
    }
    // A session that has entered only the password reads what a visitor reads.
    expect(await asStaff({ ...staff.editor, _strategy: 'local-jwt' } as User)).toBe(0)

    const versionsAs = (user: User) =>
      payload.findVersions({
        collection: 'posts',
        where: { parent: { equals: draft.id } },
        user,
        overrideAccess: false,
      })
    await expect(versionsAs(verified(staff.practitioner))).rejects.toThrow()
    expect((await versionsAs(verified(staff.editor))).totalDocs).toBeGreaterThan(0)
  })

  it('are written only by the staff who edit content, and deleted only by owners and editors', async () => {
    for (const role of ['practitioner', 'finance'] as const) {
      await expect(
        payload.create({
          collection: 'posts',
          data: { ...complete(`refused-${role}`), _status: 'published' } as Post,
          user: verified(staff[role]),
          overrideAccess: false,
        }),
        role,
      ).rejects.toThrow()
    }
    expect(await visitorFinds('refused-practitioner')).toEqual([])

    const made = await payload.create({
      collection: 'posts',
      data: { ...complete('made-by-operator'), _status: 'published' } as Post,
      user: verified(staff.operator),
      overrideAccess: false,
    })
    await expect(
      payload.delete({
        collection: 'posts',
        id: made.id,
        user: verified(staff.operator),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await payload.delete({
      collection: 'posts',
      id: made.id,
      user: verified(staff.editor),
      overrideAccess: false,
    })
    expect(await visitorFinds('made-by-operator')).toEqual([])
  })

  it('are dated when first published, and their reading time counted from the body', async () => {
    const post = await publish('dated', { body: body(450) as Post['body'] })
    expect(post.publishedAt).toEqual(expect.any(String))
    expect(post.readingTime).toBe(3)
    // A date an editor gives is kept.
    const given = await publish('given-date', { publishedAt: '2026-10-30T04:30:00.000Z' })
    expect(given.publishedAt).toBe('2026-10-30T04:30:00.000Z')
    // A draft has no date until it is published.
    const draft = await payload.create({
      collection: 'posts',
      data: { title: 'A fake draft?', slug: `${PREFIX}undated`, _status: 'draft' },
      draft: true,
    })
    expect(draft.publishedAt ?? null).toBeNull()
  })

  it('refuse to be published without the question to sit with, or with one that is not a question', async () => {
    for (const [slug, question] of [
      ['no-question', undefined],
      ['not-a-question', 'Think about a fake day.'],
      ['placeholder-question', 'What is [[TODO: fake, I-19]]?'],
    ] as const) {
      const error = await refusal(publish(slug, { question: question as string }))
      expect(
        refusedFields(error).map(({ path }) => path),
        slug,
      ).toContain('question')
      expect(await visitorFinds(slug), slug).toEqual([])
    }
  })

  it('refuse a placeholder, a title too long for the tab without a search title, and a missing topic', async () => {
    const placeholder = await refusal(
      publish('placeholder-title', { title: '[[TODO: fake, I-19]]' }),
    )
    expect(refusedFields(placeholder).map(({ path }) => path)).toContain('title')

    const long = await refusal(
      publish('long-title', { title: `A fake question ${'that runs on '.repeat(5)}?` }),
    )
    expect(refusedFields(long)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'searchTitle',
          message: expect.stringMatching(/search title/),
        }),
      ]),
    )
    await publish('long-title-with-search-title', {
      title: `A fake question ${'that runs on '.repeat(5)}?`,
      searchTitle: 'A fake search title',
    })

    const noTopic = await refusal(publish('no-topic', { topics: [] }))
    expect(refusedFields(noTopic).map(({ path }) => path)).toContain('topics')

    const longDescription = await refusal(
      publish('long-description', { description: 'f'.repeat(156) }),
    )
    expect(refusedFields(longDescription).map(({ path }) => path)).toContain('description')
  })

  it('refuse an address the Journal keeps, and a second article at the same address', async () => {
    for (const slug of ['page', 'topic']) {
      await expect(publish('reserved', { slug }), slug).rejects.toThrow()
    }
    await publish('taken')
    await expect(publish('taken')).rejects.toThrow()
  })

  it('reach the audit log when they change', async () => {
    const post = await payload.create({
      collection: 'posts',
      data: { ...complete('audited'), _status: 'published' } as Post,
      user: verified(staff.editor),
      overrideAccess: false,
    })
    const entries = await payload.find({
      collection: 'audit-log',
      where: { and: [{ entity: { equals: 'posts' } }, { entityId: { equals: String(post.id) } }] },
    })
    expect(entries.docs.map(({ action }) => action)).toContain('create')
  })
})

describe('topics', () => {
  it('are read by anyone, and written only by the staff who edit content', async () => {
    const found = await payload.find({
      collection: 'topics',
      where: { slug: { equals: `${PREFIX}topic` } },
      overrideAccess: false,
    })
    expect(found.docs.map(({ name }) => name)).toEqual(['Fake topic'])

    for (const role of ['practitioner', 'finance'] as const) {
      await expect(
        payload.create({
          collection: 'topics',
          data: { name: 'Fake refused topic', slug: `${PREFIX}refused-${role}`, door: 'learn' },
          user: verified(staff[role]),
          overrideAccess: false,
        }),
        role,
      ).rejects.toThrow()
    }
    const made = await payload.create({
      collection: 'topics',
      data: { name: 'Fake made topic', slug: `${PREFIX}made`, door: 'counselling' },
      user: verified(staff.editor),
      overrideAccess: false,
    })
    expect(made.door).toBe('counselling')
  })

  it('refuse a name past 30 characters, a placeholder, and an address that is not one', async () => {
    for (const [slug, name] of [
      ['long-name', 'F'.repeat(31)],
      ['placeholder-name', '[[TODO: fake, I-19]]'],
    ] as const) {
      await expect(
        payload.create({
          collection: 'topics',
          data: { name, slug: `${PREFIX}${slug}`, door: 'learn' },
        }),
        slug,
      ).rejects.toThrow()
    }
    await expect(
      payload.create({
        collection: 'topics',
        data: { name: 'Fake', slug: 'Int Journal Bad', door: 'learn' },
      }),
    ).rejects.toThrow()
  })

  it('stay while articles are filed under them', async () => {
    const kept = await payload.create({
      collection: 'topics',
      data: { name: 'Fake kept topic', slug: `${PREFIX}kept`, door: 'organisations' },
    })
    const post = await publish('filed', { topics: [kept.id] })
    await expect(
      payload.delete({
        collection: 'topics',
        id: kept.id,
        user: verified(staff.editor),
        overrideAccess: false,
      }),
    ).rejects.toThrow(/move them to another topic/)

    await payload.delete({ collection: 'posts', id: post.id })
    await payload.delete({
      collection: 'topics',
      id: kept.id,
      user: verified(staff.editor),
      overrideAccess: false,
    })
    const left = await payload.find({
      collection: 'topics',
      where: { slug: { equals: `${PREFIX}kept` } },
    })
    expect(left.totalDocs).toBe(0)
  })
})
