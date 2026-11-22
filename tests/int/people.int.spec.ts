import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ROLES, type Role } from '@/access/roles'
import type { ConsentVersion, Person, User } from '@/payload-types'
import config from '@/payload.config'

// The one record of a person (docs/04 `people`, S2) against the real database: who may read and
// write it (docs/04, docs/05), its contact details as stored, a verified detail belonging to one
// person, the audit log, and what deleting a person does to their consents. Obviously fake
// people, staff and texts; the mobile number is libphonenumber's own example.
let payload: Payload
const email = (label: string) => `int.people.${label}@example.invalid`
const PASSWORD = 'test-only-password-people'
const NAME = 'Fake Person int.people'
const staff = {} as Record<Role, User>
/** A staff user as Payload sees them after they entered their two-factor code. */
const verified = (user: User) => ({ ...user, collection: 'users', _strategy: 'totp' }) as User
let notice: ConsentVersion

async function removeTestData() {
  await payload.delete({ collection: 'people', where: { fullName: { like: 'int.people' } } })
  await payload.delete({ collection: 'users', where: { email: { like: 'int.people.' } } })
}

const person = (label: string, data: Partial<Person> = {}) =>
  payload.create({
    collection: 'people',
    data: { fullName: `${NAME} ${label}`, ...data } as Person,
  })

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
  // A consent text in force since yesterday, for the deletion below. Texts in force are kept
  // for good (docs/04), so each run adds one, numbered after the last.
  notice = await payload.create({
    collection: 'consent-versions',
    data: {
      purpose: 'marketingEmail',
      language: 'en-IN',
      text: 'Fake consent text (int.people).',
      effectiveFrom: new Date(Date.now() - 86_400_000).toISOString(),
    } as ConsentVersion,
  })
})

afterAll(async () => {
  await removeTestData()
})

describe('who may see and change a person (docs/04, docs/05)', () => {
  it('lets owners and the operator read people, and no other role', async () => {
    const someone = await person('read')
    for (const role of ROLES) {
      const read = payload.findByID({
        collection: 'people',
        id: someone.id,
        user: verified(staff[role]),
        overrideAccess: false,
      })
      if (role === 'owner' || role === 'operator') await expect(read, role).resolves.toBeTruthy()
      else await expect(read, role).rejects.toThrow()
    }
  })

  it('lets owners and the operator add and change people, and no other role', async () => {
    for (const role of ROLES) {
      const add = payload.create({
        collection: 'people',
        data: { fullName: `${NAME} by ${role}` } as Person,
        user: verified(staff[role]),
        overrideAccess: false,
      })
      if (role === 'owner' || role === 'operator') {
        const added = await add
        const changed = await payload.update({
          collection: 'people',
          id: added.id,
          data: { city: 'Fake City' },
          user: verified(staff[role]),
          overrideAccess: false,
        })
        expect(changed.city, role).toBe('Fake City')
      } else {
        await expect(add, role).rejects.toThrow()
      }
    }
    const someone = await person('update')
    for (const role of ['practitioner', 'editor', 'finance'] as const) {
      await expect(
        payload.update({
          collection: 'people',
          id: someone.id,
          data: { city: 'Fake City' },
          user: verified(staff[role]),
          overrideAccess: false,
        }),
        role,
      ).rejects.toThrow()
    }
  })

  it('lets only an owner delete a person: the erasure an owner confirms', async () => {
    const someone = await person('delete')
    for (const role of ROLES.filter((role) => role !== 'owner')) {
      await expect(
        payload.delete({
          collection: 'people',
          id: someone.id,
          user: verified(staff[role]),
          overrideAccess: false,
        }),
        role,
      ).rejects.toThrow()
    }
    await expect(
      payload.delete({
        collection: 'people',
        id: someone.id,
        user: verified(staff.owner),
        overrideAccess: false,
      }),
    ).resolves.toBeTruthy()
  })

  it('shows nothing to a visitor, or to staff who have not entered their code', async () => {
    const someone = await person('visitor')
    await expect(payload.find({ collection: 'people', overrideAccess: false })).rejects.toThrow()
    await expect(
      payload.findByID({ collection: 'people', id: someone.id, overrideAccess: false }),
    ).rejects.toThrow()
    // A password alone, without the two-factor code (payload-totp, docs/08 §9).
    await expect(
      payload.find({
        collection: 'people',
        user: { ...staff.owner, collection: 'users', _strategy: 'local-jwt' } as User,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })
})

describe('a person’s details', () => {
  it('keeps a mobile number in E.164 and an email in small letters', async () => {
    const someone = await person('details', {
      mobile: '81234 56789',
      email: '  Fake.Person.Details@Example.invalid ',
      utm: { source: 'fake-source' },
      tags: ['fake-tag'],
    })
    expect(someone).toMatchObject({
      mobile: '+918123456789',
      email: 'fake.person.details@example.invalid',
      language: 'en-IN',
      utm: { source: 'fake-source' },
      tags: ['fake-tag'],
    })
  })

  it('refuses a mobile number no country uses', async () => {
    await expect(person('bad mobile', { mobile: '12345' })).rejects.toThrow()
  })

  it('lets two records share an unverified number, and not a verified one', async () => {
    const mobile = '+918123456789'
    const first = await person('first', { mobile })
    const second = await person('second', { mobile })
    // Verification comes from the server, once the person proves the number (R2).
    const now = new Date().toISOString()
    await payload.update({ collection: 'people', id: first.id, data: { mobileVerifiedAt: now } })
    await expect(
      payload.update({ collection: 'people', id: second.id, data: { mobileVerifiedAt: now } }),
    ).rejects.toThrow()
    // Staff cannot mark a number verified by hand.
    const marked = await payload.update({
      collection: 'people',
      id: second.id,
      data: { mobileVerifiedAt: now },
      user: verified(staff.operator),
      overrideAccess: false,
    })
    expect(marked.mobileVerifiedAt ?? null).toBeNull()
  })

  it('writes every change to the audit log by field name, never by value', async () => {
    const someone = await person('audit')
    await payload.update({
      collection: 'people',
      id: someone.id,
      data: { city: 'Fake Audited City', utm: { campaign: 'fake-campaign' } },
      user: verified(staff.operator),
      overrideAccess: false,
    })
    const { docs } = await payload.find({
      collection: 'audit-log',
      where: { entity: { equals: 'people' }, entityId: { equals: String(someone.id) } },
      sort: '-at',
      overrideAccess: true,
    })
    expect(docs[0]).toMatchObject({
      action: 'update',
      actorId: String(staff.operator.id),
      changed: 'city, utm.campaign',
    })
    expect(docs.at(-1)).toMatchObject({ action: 'create' })
    expect(JSON.stringify(docs)).not.toContain('Fake Audited City')
  })
})

describe('deleting a person', () => {
  it('marks their consents withdrawn, and keeps the ledger', async () => {
    const someone = await person('erased')
    const grant = await payload.create({
      collection: 'consents',
      data: {
        person: someone.id,
        noticeVersion: notice.id,
        channel: 'web',
        evidence: { form: 'Fake form' },
      } as never,
    })
    await payload.delete({
      collection: 'people',
      id: someone.id,
      user: verified(staff.owner),
      overrideAccess: false,
    })
    const kept = await payload.findByID({ collection: 'consents', id: grant.id, depth: 0 })
    // The consent itself is unchanged but for the person, whose record is gone.
    expect(kept).toMatchObject({ purpose: 'marketingEmail', channel: 'web' })
    expect(kept.person ?? null).toBeNull()
    expect(kept.withdrawnAt ?? null).toBeNull()
    const { docs } = await payload.find({
      collection: 'consents',
      where: { withdraws: { equals: grant.id } },
      depth: 0,
    })
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({
      channel: 'recordDeleted',
      purpose: 'marketingEmail',
      grantedAt: kept.grantedAt,
    })
    expect(docs[0]?.withdrawnAt).toBeTruthy()
  })
})
