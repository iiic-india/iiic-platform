import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Booking, Person, Practitioner, Service, User } from '@/payload-types'
import config from '@/payload.config'

// The owner's rule of 22 November 2026 against the real database: a practitioner reads the name,
// mobile and email of the people who have a booking with them, through those bookings, and
// nobody else's, and nothing else on the record (src/access/policy.ts: POLICY.people,
// FIELD_POLICY.personRecord). Obviously fake staff, profiles, people and bookings, removed at the
// end; the mobile number is libphonenumber's own example.

let payload: Payload
const TAG = 'int.practitionerClients'
const REF = 'INT-PCL-'
const PASSWORD = 'test-only-password-practitioner-clients'
const staff = {} as Record<'owner' | 'operator' | 'practitionerA' | 'practitionerB', User>
const profile = {} as Record<'mine' | 'theirs', Practitioner>
const client = {} as Record<'mine' | 'theirs' | 'nobodys', Person>
let service: Service

/** A staff user as Payload sees them after they entered their two-factor code. */
const verified = (user: User) => ({ ...user, collection: 'users', _strategy: 'totp' }) as User

/** A fixed hour far ahead, on a day no other test uses. */
const at = (minutes: number) => new Date(Date.UTC(2099, 3, 11, 4, 30) + minutes * 60_000)

/** Everything on a person's record that the practitioner must not read. */
const NOT_SHARED = [
  'mobileVerifiedAt',
  'emailVerifiedAt',
  'preferredChannel',
  'language',
  'ageBand',
  'city',
  'source',
  'utm',
  'tags',
  'consents',
  'bookings',
] as const

async function removeTestData() {
  await payload.delete({ collection: 'bookings', where: { reference: { like: REF } } })
  await payload.delete({ collection: 'practitioners', where: { publicName: { like: TAG } } })
  await payload.delete({
    collection: 'services',
    where: { slug: { like: 'int-practitioner-clients' } },
  })
  await payload.delete({ collection: 'people', where: { fullName: { like: TAG } } })
  await payload.delete({ collection: 'users', where: { email: { like: `${TAG}.` } } })
}

const person = (label: string) =>
  payload.create({
    collection: 'people',
    data: {
      fullName: `Fake Person ${label} ${TAG}`,
      mobile: '+918123456789',
      email: `${TAG}.${label}@example.invalid`,
      city: 'Fake City',
      ageBand: 'adult',
      source: 'fake source',
      tags: ['fake'],
      utm: { campaign: 'fake' },
    } as Person,
  })

async function book(of: Person, with_: Practitioner, slot: number) {
  return payload.create({
    collection: 'bookings',
    data: {
      reference: `${REF}${(Date.now() % 1_000_000).toString(36)}-${slot}`,
      type: 'session',
      status: 'confirmed',
      paymentStatus: 'notRequired',
      service: service.id,
      person: of.id,
      practitioner: with_.id,
      startsAt: at(slot * 60).toISOString(),
      endsAt: at(slot * 60 + 30).toISOString(),
    } as Booking,
  })
}

async function auditCount(entityId: number) {
  const { totalDocs } = await payload.count({
    collection: 'audit-log',
    where: { and: [{ entity: { equals: 'people' } }, { entityId: { equals: String(entityId) } }] },
  })
  return totalDocs
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  // The owner first: on an empty table the first account becomes the owner anyway.
  const roles = {
    owner: 'owner',
    operator: 'operator',
    practitionerA: 'practitioner',
    practitionerB: 'practitioner',
  } as const
  for (const [key, role] of Object.entries(roles) as [keyof typeof roles, string][]) {
    staff[key] = await payload.create({
      collection: 'users',
      data: {
        name: `Fake ${key}`,
        email: `${TAG}.${key}@example.invalid`,
        password: PASSWORD,
        roles: [role],
      } as User,
    })
  }
  service = await payload.create({
    collection: 'services',
    data: {
      name: `Fake service ${TAG}`,
      type: 'session',
      slug: `int-practitioner-clients-${Date.now()}`,
      register: 'counselling',
      format: 'online',
    } as Service,
  })
  profile.mine = await payload.create({
    collection: 'practitioners',
    data: { publicName: `Fake mine ${TAG}`, staff: staff.practitionerA.id } as Practitioner,
  })
  profile.theirs = await payload.create({
    collection: 'practitioners',
    data: { publicName: `Fake theirs ${TAG}`, staff: staff.practitionerB.id } as Practitioner,
  })
  client.mine = await person('mine')
  client.theirs = await person('theirs')
  client.nobodys = await person('nobodys')
  await book(client.mine, profile.mine, 1)
  await book(client.theirs, profile.theirs, 2)
})

afterAll(async () => {
  await removeTestData()
})

describe('a practitioner and their own clients (the owner, 22 November 2026)', () => {
  it('reads the name, mobile and email of a person with a booking of theirs, and nothing else', async () => {
    const { docs } = await payload.find({
      collection: 'people',
      where: { fullName: { like: TAG } },
      user: verified(staff.practitionerA),
      overrideAccess: false,
    })
    expect(docs.map((doc) => doc.id)).toEqual([client.mine.id])
    const [read] = docs
    expect(read?.fullName).toBe(client.mine.fullName)
    expect(read?.mobile).toBe('+918123456789')
    expect(read?.email).toBe(client.mine.email)
    for (const field of NOT_SHARED) {
      expect(
        (read as unknown as Record<string, unknown> | undefined)?.[field],
        field,
      ).toBeUndefined()
    }
    const byId = await payload.findByID({
      collection: 'people',
      id: client.mine.id,
      user: verified(staff.practitionerA),
      overrideAccess: false,
    })
    expect(byId.fullName).toBe(client.mine.fullName)
    for (const field of NOT_SHARED) {
      expect((byId as unknown as Record<string, unknown>)[field], field).toBeUndefined()
    }
  })

  it('does not read another practitioner’s client, or a person nobody has booked with', async () => {
    for (const other of [client.theirs, client.nobodys]) {
      await expect(
        payload.findByID({
          collection: 'people',
          id: other.id,
          user: verified(staff.practitionerA),
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    }
    const { docs } = await payload.find({
      collection: 'people',
      where: { fullName: { like: TAG } },
      user: verified(staff.practitionerB),
      overrideAccess: false,
    })
    expect(docs.map((doc) => doc.id)).toEqual([client.theirs.id])
  })

  it('needs the two-factor code, as every staff read does', async () => {
    await expect(
      payload.find({
        collection: 'people',
        user: { ...staff.practitionerA, collection: 'users', _strategy: 'local-jwt' } as User,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('changes no one’s record, so nothing reaches the audit log', async () => {
    const before = await auditCount(client.mine.id)
    await expect(
      payload.update({
        collection: 'people',
        id: client.mine.id,
        data: { city: 'Changed by a practitioner' },
        user: verified(staff.practitionerA),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    expect(await auditCount(client.mine.id)).toBe(before)
    const unchanged = await payload.findByID({ collection: 'people', id: client.mine.id })
    expect(unchanged.city).toBe('Fake City')
  })

  it('leaves the office reading every person and every field', async () => {
    const { docs } = await payload.find({
      collection: 'people',
      where: { fullName: { like: TAG } },
      user: verified(staff.operator),
      overrideAccess: false,
    })
    expect(docs).toHaveLength(3)
    for (const doc of docs) {
      expect(doc.city).toBe('Fake City')
      expect(doc.ageBand).toBe('adult')
    }
  })
})
