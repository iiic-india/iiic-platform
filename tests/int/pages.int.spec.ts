import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { User } from '@/payload-types'
import config from '@/payload.config'

// Pages against the real database (docs/05, Content): who reads what, who writes, and the
// page rules. Obviously fake accounts and content.
let payload: Payload
const email = (label: string) => `int.pages.${label}@example.invalid`
const PASSWORD = 'test-only-password-pages'
/** A staff user as Payload sees them after they entered their two-factor code. */
const verified = (user: User) => ({ ...user, _strategy: 'totp' }) as User
let editor: User
let practitioner: User

const hero = {
  blockType: 'hero' as const,
  heading: 'Fake heading',
  copyStatus: 'approved' as const,
}
const band = { blockType: 'band' as const, heading: 'Fake band', copyStatus: 'approved' as const }

async function removeTestData() {
  await payload.delete({ collection: 'pages', where: { slug: { like: 'int-pages-' } } })
  await payload.delete({ collection: 'users', where: { email: { like: 'int.pages.' } } })
}

async function staff(role: 'owner' | 'editor' | 'practitioner') {
  return payload.create({
    collection: 'users',
    data: { name: `Fake ${role}`, email: email(role), password: PASSWORD, roles: [role] },
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
    const slug = 'int-pages-draft-then-published'
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

  it('lets the staff who edit content read a draft, and no other staff', async () => {
    const slug = 'int-pages-draft-readers'
    await payload.create({
      collection: 'pages',
      data: { title: 'Fake draft', slug, layout: [hero], _status: 'draft' },
      draft: true,
    })
    const asStaff = async (user: User) =>
      (
        await payload.find({
          collection: 'pages',
          where: { slug: { equals: slug } },
          user: verified(user),
          overrideAccess: false,
          draft: true,
        })
      ).totalDocs
    expect(await asStaff(editor)).toBe(1)
    expect(await asStaff(practitioner)).toBe(0)
  })

  it('refuses a page from staff who do not edit content', async () => {
    await expect(
      payload.create({
        collection: 'pages',
        data: { title: 'Fake page', slug: 'int-pages-refused', layout: [hero] },
        user: verified(practitioner),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    expect(await visitorFinds('int-pages-refused')).toBe(0)
  })

  it('publishes a page whose yellow band closes it, and refuses any other use of the band', async () => {
    const publish = (slug: string, layout: (typeof hero | typeof band)[]) =>
      payload.create({
        collection: 'pages',
        data: { title: 'Fake page', slug, layout, _status: 'published' },
      })
    await publish('int-pages-band-last', [hero, band])
    expect(await visitorFinds('int-pages-band-last')).toBe(1)
    await expect(publish('int-pages-band-first', [band, hero])).rejects.toThrow()
    await expect(publish('int-pages-two-bands', [hero, band, band])).rejects.toThrow()
  })

  it('refuses an address a page cannot have, and a second page at the same address', async () => {
    const publish = (slug: string) =>
      payload.create({
        collection: 'pages',
        data: { title: 'Fake page', slug, layout: [hero], _status: 'published' },
      })
    await expect(publish('Int-Pages Bad Address')).rejects.toThrow()
    await publish('int-pages-taken')
    await expect(publish('int-pages-taken')).rejects.toThrow()
  })
})
