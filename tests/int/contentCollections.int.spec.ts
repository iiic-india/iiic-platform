import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ROLES, type Role } from '@/access/roles'
import type { Service, User } from '@/payload-types'
import config from '@/payload.config'

// Services, practitioners and FAQs against the real database (docs/04; docs/05, Settings and
// Content): who reads what, which fields a visitor never receives, and who writes. Obviously
// fake accounts and content.
let payload: Payload
const email = (label: string) => `int.content.${label}@example.invalid`
const PASSWORD = 'test-only-password-content'
const staff = {} as Record<Role, User>
/** A staff user as Payload sees them after they entered their two-factor code. */
const verified = (user: User) => ({ ...user, _strategy: 'totp' }) as User
/** The same user with only their password entered. */
const passwordOnly = (user: User) => ({ ...user, _strategy: 'local-jwt' }) as User

const SERVICE_SLUG = 'int-content-'
const NAME = 'int.content.'

async function removeTestData() {
  await payload.delete({ collection: 'faqs', where: { question: { like: NAME } } })
  await payload.delete({ collection: 'practitioners', where: { publicName: { like: NAME } } })
  await payload.delete({ collection: 'services', where: { slug: { like: SERVICE_SLUG } } })
  await payload.delete({ collection: 'users', where: { email: { like: 'int.content.' } } })
}

/** A fake service with a price on its one option, as an owner would save it. */
function serviceData(label: string, active: boolean) {
  return {
    name: `${NAME}${label}`,
    slug: `${SERVICE_SLUG}${label}`,
    type: 'session' as const,
    register: 'counselling' as const,
    format: 'online' as const,
    options: [{ label: 'Fake option', duration: 30, price: 150000, gstInclusive: true }],
    sacCode: '999999',
    bookingRules: { noticeHours: 12 },
    active,
  }
}

/** A service as a visitor's read returns it, or undefined where none is returned. */
async function visitorReads(slug: string): Promise<Service | undefined> {
  const { docs } = await payload.find({
    collection: 'services',
    where: { slug: { equals: slug } },
    overrideAccess: false,
  })
  return docs[0]
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

describe('services (docs/04; docs/05, Settings)', () => {
  it('shows a visitor an active service only, and never its prices, GST, SAC code or rules', async () => {
    await payload.create({ collection: 'services', data: serviceData('active', true) })
    await payload.create({ collection: 'services', data: serviceData('inactive', false) })

    expect(await visitorReads(`${SERVICE_SLUG}inactive`)).toBeUndefined()
    const seen = await visitorReads(`${SERVICE_SLUG}active`)
    expect(seen?.name).toBe(`${NAME}active`)
    expect(seen?.options?.[0]?.duration).toBe(30)
    // D-21: no price reaches anyone outside the staff who set, quote or account for it.
    expect(seen?.options?.[0]).not.toHaveProperty('price')
    expect(seen?.options?.[0]).not.toHaveProperty('gstInclusive')
    expect(seen).not.toHaveProperty('sacCode')
    expect(seen).not.toHaveProperty('bookingRules')
  })

  it('gives the price to owners, operators and finance once they have entered their code', async () => {
    const asStaff = async (user: User) =>
      (
        await payload.find({
          collection: 'services',
          where: { slug: { equals: `${SERVICE_SLUG}active` } },
          user,
          overrideAccess: false,
        })
      ).docs[0]
    for (const role of ROLES) {
      const read = await asStaff(verified(staff[role]))
      const pricing = ['owner', 'operator', 'finance'].includes(role)
      expect(read?.options?.[0]?.price, role).toBe(pricing ? 150000 : undefined)
      // Every staff role reads the booking rules.
      expect(read?.bookingRules?.noticeHours, role).toBe(12)
    }
    // A password alone reads what a visitor reads.
    expect((await asStaff(passwordOnly(staff.owner)))?.options?.[0]).not.toHaveProperty('price')
  })

  it('lets owners add and change services, and nobody else; nobody deletes one', async () => {
    for (const role of ROLES.filter((role) => role !== 'owner')) {
      await expect(
        payload.create({
          collection: 'services',
          data: serviceData(`refused-${role}`, false),
          user: verified(staff[role]),
          overrideAccess: false,
        }),
        role,
      ).rejects.toThrow()
    }
    const created = await payload.create({
      collection: 'services',
      data: serviceData('owned', false),
      user: verified(staff.owner),
      overrideAccess: false,
    })
    expect(created.options?.[0]?.price).toBe(150000)
    await expect(
      payload.update({
        collection: 'services',
        id: created.id,
        data: { name: `${NAME}renamed` },
        user: verified(staff.operator),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    // Retired by unticking, never deleted: bookings will point at it (M3).
    await expect(
      payload.delete({
        collection: 'services',
        id: created.id,
        user: verified(staff.owner),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('keeps prices in whole paise', async () => {
    const data = serviceData('fraction', false)
    await expect(
      payload.create({
        collection: 'services',
        data: { ...data, options: [{ duration: 30, price: 1500.5 }] },
      }),
    ).rejects.toThrow()
  })
})

describe('practitioners (docs/04, S0 public profile)', () => {
  it('shows a visitor an active profile’s public fields only, never the staff account', async () => {
    await payload.create({
      collection: 'practitioners',
      data: {
        publicName: `${NAME}active`,
        bio: 'Fake biography.',
        staff: staff.practitioner.id,
        active: true,
      },
    })
    await payload.create({
      collection: 'practitioners',
      data: { publicName: `${NAME}inactive`, active: false },
    })
    const { docs } = await payload.find({
      collection: 'practitioners',
      where: { publicName: { like: NAME } },
      overrideAccess: false,
    })
    expect(docs.map((doc) => doc.publicName)).toEqual([`${NAME}active`])
    expect(docs[0]?.bio).toBe('Fake biography.')
    expect(docs[0]).not.toHaveProperty('staff')
  })

  it('lets the staff who keep content read every profile, with the staff account', async () => {
    const { docs } = await payload.find({
      collection: 'practitioners',
      where: { publicName: { like: NAME } },
      user: verified(staff.editor),
      overrideAccess: false,
      depth: 0,
    })
    expect(docs).toHaveLength(2)
    expect(docs.find((doc) => doc.publicName === `${NAME}active`)?.staff).toBe(
      staff.practitioner.id,
    )
  })

  it('lets owners, operators and editors keep profiles, only an owner link an account or delete one', async () => {
    for (const role of ['practitioner', 'finance'] as const) {
      await expect(
        payload.create({
          collection: 'practitioners',
          data: { publicName: `${NAME}refused-${role}` },
          user: verified(staff[role]),
          overrideAccess: false,
        }),
        role,
      ).rejects.toThrow()
    }
    // An editor's profile is saved, but the staff account is an owner's to link.
    const profile = await payload.create({
      collection: 'practitioners',
      data: { publicName: `${NAME}by-editor`, staff: staff.practitioner.id },
      user: verified(staff.editor),
      overrideAccess: false,
      depth: 0,
    })
    expect(profile.staff ?? null).toBeNull()
    await expect(
      payload.delete({
        collection: 'practitioners',
        id: profile.id,
        user: verified(staff.editor),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await payload.delete({
      collection: 'practitioners',
      id: profile.id,
      user: verified(staff.owner),
      overrideAccess: false,
    })
  })
})

describe('FAQs (docs/05, Content)', () => {
  it('shows a visitor a published question only', async () => {
    const draft = await payload.create({
      collection: 'faqs',
      data: {
        question: `${NAME}draft question?`,
        answer: 'Fake answer.',
        page: 'organisations/team-map',
        order: 1,
        _status: 'draft',
      },
      draft: true,
      user: verified(staff.editor),
      overrideAccess: false,
    })
    const visitorFinds = async () =>
      (
        await payload.find({
          collection: 'faqs',
          where: { id: { equals: draft.id } },
          overrideAccess: false,
        })
      ).totalDocs
    expect(await visitorFinds()).toBe(0)
    // The staff who edit content read the draft once they have entered their code; a password
    // alone, or another role, reads what a visitor reads.
    const asStaff = async (user: User) =>
      (
        await payload.find({
          collection: 'faqs',
          where: { id: { equals: draft.id } },
          user,
          overrideAccess: false,
          draft: true,
        })
      ).totalDocs
    expect(await asStaff(verified(staff.operator))).toBe(1)
    expect(await asStaff(verified(staff.practitioner))).toBe(0)
    expect(await asStaff(passwordOnly(staff.editor))).toBe(0)

    await payload.update({
      collection: 'faqs',
      id: draft.id,
      data: { _status: 'published' },
      user: verified(staff.editor),
      overrideAccess: false,
    })
    expect(await visitorFinds()).toBe(1)
  })

  it('publishes a question only for a page the site has, and only without a placeholder', async () => {
    const publish = (data: { question: string; answer: string; page: string }) =>
      payload.create({ collection: 'faqs', data: { ...data, order: 1, _status: 'published' } })
    await expect(
      publish({ question: `${NAME}nowhere?`, answer: 'Fake answer.', page: 'no-such-page' }),
    ).rejects.toThrow()
    await expect(
      publish({
        question: `${NAME}unfinished?`,
        answer: '[[TODO: fake answer, I-20]]',
        page: 'counselling',
      }),
    ).rejects.toThrow()
    await expect(
      publish({ question: `${NAME}starter page?`, answer: 'Fake answer.', page: 'organisations' }),
    ).resolves.toBeTruthy()
  })

  it('lets owners, operators and editors write questions; only owners and editors delete them', async () => {
    for (const role of ['practitioner', 'finance'] as const) {
      await expect(
        payload.create({
          collection: 'faqs',
          data: { question: `${NAME}refused?`, answer: 'Fake answer.', page: 'counselling' },
          draft: true,
          user: verified(staff[role]),
          overrideAccess: false,
        }),
        role,
      ).rejects.toThrow()
    }
    const question = await payload.create({
      collection: 'faqs',
      data: { question: `${NAME}to delete?`, answer: 'Fake answer.', page: 'counselling' },
      draft: true,
      user: verified(staff.operator),
      overrideAccess: false,
    })
    await expect(
      payload.delete({
        collection: 'faqs',
        id: question.id,
        user: verified(staff.operator),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await payload.delete({
      collection: 'faqs',
      id: question.id,
      user: verified(staff.editor),
      overrideAccess: false,
    })
  })
})
