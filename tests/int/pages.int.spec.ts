import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Page, User } from '@/payload-types'
import config from '@/payload.config'

// Pages against the real database (docs/05, Content): who reads what, who writes, and the
// page rules. Obviously fake accounts and content.
let payload: Payload
const email = (label: string) => `int.pages.${label}@example.invalid`
const ROLES = ['owner', 'editor', 'practitioner'] as const
const PASSWORD = 'test-only-password-pages'
/** A staff user as Payload sees them after they entered their two-factor code. */
const verified = (user: User) => ({ ...user, _strategy: 'totp' }) as User
let editor: User
let practitioner: User

/**
 * Every address this file creates a page at, refused ones included. The cleanup deletes
 * exactly these, so it never touches another file's pages.
 */
const SLUG = {
  draftThenPublished: 'int-pages-draft-then-published',
  draftReaders: 'int-pages-draft-readers',
  refused: 'int-pages-refused',
  firstPublished: 'int-pages-first-published',
  bornPublished: 'int-pages-born-published',
  unpublishDraft: 'int-pages-unpublish-draft',
  bandLast: 'int-pages-band-last',
  bandFirst: 'int-pages-band-first',
  twoBands: 'int-pages-two-bands',
  noHero: 'int-pages-no-hero',
  twoHeroes: 'int-pages-two-heroes',
  lateHero: 'int-pages-late-hero',
  anchorMain: 'int-pages-anchor-main',
  mistyped: 'int-pages-mistyped',
  titleTodo: 'int-pages-title-todo',
  longTitle: 'int-pages-long-title',
  descriptionTodo: 'int-pages-description-todo',
  longDescription: 'int-pages-long-description',
  blankHeading: 'int-pages-blank-heading',
  wordsNoLink: 'int-pages-words-no-link',
  sanskritTodo: 'int-pages-sanskrit-todo',
  taken: 'int-pages-taken',
} as const

const hero = {
  blockType: 'hero' as const,
  heading: 'Fake heading',
  copyStatus: 'approved' as const,
}
const statement = {
  blockType: 'statement' as const,
  heading: 'Fake statement',
  paragraphs: [{ text: 'Fake paragraph' }],
  copyStatus: 'approved' as const,
}
const band = { blockType: 'band' as const, heading: 'Fake band', copyStatus: 'approved' as const }

async function removeTestData() {
  await payload.delete({
    collection: 'pages',
    where: { slug: { in: Object.values(SLUG) } },
  })
  await payload.delete({ collection: 'users', where: { email: { in: ROLES.map(email) } } })
}

async function staff(role: (typeof ROLES)[number]) {
  return payload.create({
    collection: 'users',
    data: { name: `Fake ${role}`, email: email(role), password: PASSWORD, roles: [role] },
  })
}

/** Creates a page as published at once: every page rule applies. */
function publish(
  slug: string,
  layout: Page['layout'],
  fields: Partial<Pick<Page, 'title' | 'description'>> = {},
) {
  return payload.create({
    collection: 'pages',
    data: { title: 'Fake page', ...fields, slug, layout, _status: 'published' },
  })
}

/** What a visitor finds at an address: no sign-in, access rules applied. */
async function visitorFinds(slug: string) {
  const found = await payload.find({
    collection: 'pages',
    where: { slug: { equals: slug } },
    overrideAccess: false,
  })
  return found.totalDocs
}

/** The fields a refused save names, each with its message (Payload's ValidationError). */
function refusedFields(error: unknown): unknown[] {
  return (error as { data?: { errors?: unknown[] } } | null)?.data?.errors ?? []
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  // The owner first: on an empty table the first account becomes the owner anyway.
  await staff('owner')
  editor = await staff('editor')
  practitioner = await staff('practitioner')
})

afterAll(async () => {
  await removeTestData()
})

describe('pages', () => {
  it('shows a visitor a page only once it is published', async () => {
    const slug = SLUG.draftThenPublished
    const draft = await payload.create({
      collection: 'pages',
      data: { title: 'Fake page', slug, layout: [hero], _status: 'draft' },
      draft: true,
      user: verified(editor),
      overrideAccess: false,
    })
    expect(await visitorFinds(slug)).toBe(0)

    await payload.update({
      collection: 'pages',
      id: draft.id,
      data: { _status: 'published' },
      user: verified(editor),
      overrideAccess: false,
    })
    expect(await visitorFinds(slug)).toBe(1)
  })

  it('lets the staff who edit content read drafts and earlier versions once they have entered their code, and no other staff', async () => {
    const slug = SLUG.draftReaders
    const draft = await payload.create({
      collection: 'pages',
      data: { title: 'Fake draft', slug, layout: [hero], _status: 'draft' },
      draft: true,
    })
    const passwordOnly = { ...editor, _strategy: 'local-jwt' } as User
    const asStaff = async (user: User) =>
      (
        await payload.find({
          collection: 'pages',
          where: { slug: { equals: slug } },
          user,
          overrideAccess: false,
          draft: true,
        })
      ).totalDocs
    expect(await asStaff(verified(editor))).toBe(1)
    expect(await asStaff(verified(practitioner))).toBe(0)
    // A session that has entered only the password reads what a visitor reads.
    expect(await asStaff(passwordOnly)).toBe(0)

    // Earlier versions hold every draft, so the same staff read them, and only with the code.
    const versionsAs = (user: User) =>
      payload.findVersions({
        collection: 'pages',
        where: { parent: { equals: draft.id } },
        user,
        overrideAccess: false,
      })
    await expect(versionsAs(verified(practitioner))).rejects.toThrow()
    await expect(versionsAs(passwordOnly)).rejects.toThrow()
    expect((await versionsAs(verified(editor))).totalDocs).toBeGreaterThan(0)
  })

  it('refuses a page from staff who do not edit content', async () => {
    await expect(
      payload.create({
        collection: 'pages',
        data: { title: 'Fake page', slug: SLUG.refused, layout: [hero] },
        user: verified(practitioner),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    expect(await visitorFinds(SLUG.refused)).toBe(0)
  })

  it('records when a page is first published, and keeps it through an unpublish (D-57)', async () => {
    const slug = SLUG.firstPublished
    const draft = await payload.create({
      collection: 'pages',
      data: { title: 'Fake page', slug, layout: [hero], _status: 'draft' },
      draft: true,
      user: verified(editor),
      overrideAccess: false,
    })
    expect(draft.firstPublishedAt ?? null).toBeNull()

    const published = await payload.update({
      collection: 'pages',
      id: draft.id,
      data: { _status: 'published' },
      user: verified(editor),
      overrideAccess: false,
    })
    expect(published.firstPublishedAt).toEqual(expect.any(String))

    // An unpublish: a change of status, not a draft save.
    const unpublished = await payload.update({
      collection: 'pages',
      id: draft.id,
      data: { _status: 'draft' },
      user: verified(editor),
      overrideAccess: false,
    })
    expect(unpublished._status).toBe('draft')
    expect(unpublished.firstPublishedAt).toBe(published.firstPublishedAt)
    expect(await visitorFinds(slug)).toBe(0)

    const born = await publish(SLUG.bornPublished, [hero])
    expect(born.firstPublishedAt).toEqual(expect.any(String))
  })

  it('takes a page off the site whatever its newer draft holds, and still refuses to publish that draft', async () => {
    const slug = SLUG.unpublishDraft
    const published = await publish(slug, [hero])
    // A draft saved on top that breaks the page rules: a placeholder in the title and the
    // description, no hero, a heading of spaces, button words without their link, and a
    // placeholder in the Sanskrit line. Payload's own checks (required fields, lengths) pass.
    await payload.update({
      collection: 'pages',
      id: published.id,
      data: {
        title: '[[TODO: fake, I-41]]',
        description: 'Fake [[TODO: fake, I-41]]',
        layout: [
          { ...statement, heading: '   ', action: { label: 'Fake action' } },
          { ...band, sanskrit: '[[TODO: fake, I-41]]' },
        ],
      },
      draft: true,
    })
    // An unpublish through the API checks every field against that draft; the page rules pass
    // it (the admin's Unpublish button checks the status alone).
    const unpublished = await payload.update({
      collection: 'pages',
      id: published.id,
      data: { _status: 'draft' },
    })
    expect(unpublished._status).toBe('draft')
    expect(unpublished.firstPublishedAt).toBe(published.firstPublishedAt)
    expect(await visitorFinds(slug)).toBe(0)

    const error = await payload
      .update({ collection: 'pages', id: published.id, data: { _status: 'published' } })
      .then(
        () => null,
        (refusal: unknown) => refusal,
      )
    expect(refusedFields(error)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'title', message: expect.stringMatching(/browser tab/) }),
        expect.objectContaining({ path: 'layout', message: expect.stringMatching(/hero/) }),
      ]),
    )
    expect(await visitorFinds(slug)).toBe(0)
  })

  it('publishes a page whose yellow band closes it, and refuses any other use of the band', async () => {
    await publish(SLUG.bandLast, [hero, band])
    expect(await visitorFinds(SLUG.bandLast)).toBe(1)
    await expect(publish(SLUG.bandFirst, [band, hero])).rejects.toThrow()
    await expect(publish(SLUG.twoBands, [hero, band, band])).rejects.toThrow()
  })

  it('refuses a page that does not open with its one hero', async () => {
    await expect(publish(SLUG.noHero, [statement])).rejects.toThrow()
    await expect(publish(SLUG.twoHeroes, [hero, hero])).rejects.toThrow()
    await expect(publish(SLUG.lateHero, [statement, hero])).rejects.toThrow()
  })

  it('refuses a link name the page shell already uses', async () => {
    await expect(
      publish(SLUG.anchorMain, [hero, { ...statement, anchor: 'main' }]),
    ).rejects.toThrow()
  })

  it('refuses a placeholder typed another way, and any placeholder in the title or the description', async () => {
    await expect(publish(SLUG.mistyped, [{ ...hero, lead: '[[TODO: fake]]' }])).rejects.toThrow()
    await expect(
      publish(SLUG.titleTodo, [hero], { title: '[[TODO: fake, I-41]]' }),
    ).rejects.toThrow()
    await expect(
      publish(SLUG.descriptionTodo, [hero], { description: 'Fake [[TODO: fake, I-41]]' }),
    ).rejects.toThrow()
    // The title's and the description's own limits still hold beside the new check.
    await expect(
      publish(SLUG.longTitle, [hero], { title: `Fake page ${'x'.repeat(44)}` }),
    ).rejects.toThrow()
    await expect(
      publish(SLUG.longDescription, [hero], { description: 'x'.repeat(156) }),
    ).rejects.toThrow()
  })

  it('refuses a heading of spaces, button words without a link, and a placeholder in the Sanskrit line', async () => {
    await expect(publish(SLUG.blankHeading, [{ ...hero, heading: '   ' }])).rejects.toThrow()
    await expect(
      publish(SLUG.wordsNoLink, [{ ...hero, primary: { label: 'Fake action' } }]),
    ).rejects.toThrow()
    await expect(
      publish(SLUG.sanskritTodo, [hero, { ...band, sanskrit: '[[TODO: fake, I-41]]' }]),
    ).rejects.toThrow()
  })

  it('refuses to publish the counselling page without the scope statement, or the learn page without the certificate statement', async () => {
    for (const [slug, rule] of [
      ['counselling', /scope statement/],
      ['learn', /certificate statement/],
    ] as const) {
      // These are starter pages' addresses: should a page be made here, it is removed at once,
      // so the test never leaves one behind for the starter-page tests to find.
      const error = await publish(slug, [hero]).then(
        async (made) => {
          await payload.delete({ collection: 'pages', id: made.id })
          return null
        },
        (refusal: unknown) => refusal,
      )
      // Refused by the rule for this address, not by any other check.
      expect(refusedFields(error), slug).toEqual([
        expect.objectContaining({ path: 'layout', message: expect.stringMatching(rule) }),
      ])
      expect(await visitorFinds(slug)).toBe(0)
    }
  })

  it('refuses an address a page cannot have, and a second page at the same address', async () => {
    await expect(publish('Int-Pages Bad Address', [hero])).rejects.toThrow()
    await publish(SLUG.taken, [hero])
    await expect(publish(SLUG.taken, [hero])).rejects.toThrow()
  })
})
