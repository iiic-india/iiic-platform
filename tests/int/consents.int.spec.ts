import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ROLES, type Role } from '@/access/roles'
import { consentFor, currentNotice } from '@/lib/privacy/consents'
import type { Consent, ConsentVersion, Person, User } from '@/payload-types'
import config from '@/payload.config'

// The consent ledger (docs/04 `consents`; docs/08 §3; docs/12 §11) against the real database:
// who may read and record it, entries that are never changed or deleted, withdrawals recorded
// as entries of their own, and each consent naming the notice it was given under. Consent
// texts in force are kept for good, so each run adds its own, after the last. Entries are
// never deleted either: this file's people are deleted at the end, and their entries stay,
// marked withdrawn and without a person. Obviously fake people, staff and texts.
let payload: Payload
const email = (label: string) => `int.consents.${label}@example.invalid`
const PASSWORD = 'test-only-password-consents'
const NAME = 'Fake Person int.consents'
const staff = {} as Record<Role, User>
/** A staff user as Payload sees them after they entered their two-factor code. */
const verified = (user: User) => ({ ...user, collection: 'users', _strategy: 'totp' }) as User
const DAY = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()
let notice: ConsentVersion
let someone: Person

async function removeTestData() {
  await payload.delete({ collection: 'people', where: { fullName: { like: 'int.consents' } } })
  await payload.delete({ collection: 'users', where: { email: { like: 'int.consents.' } } })
}

const text = (purpose: ConsentVersion['purpose'], effectiveFrom: string) =>
  payload.create({
    collection: 'consent-versions',
    data: {
      purpose,
      language: 'en-IN',
      text: `Fake consent text for ${purpose} (int.consents).`,
      effectiveFrom,
    } as ConsentVersion,
  })

/** A consent as a form on the site records it, on the server. */
const consentOnTheSite = (person: Person, data: Partial<Consent> = {}) =>
  payload.create({
    collection: 'consents',
    data: {
      person: person.id,
      noticeVersion: notice.id,
      channel: 'web',
      evidence: { form: 'Fake form', ip: '203.0.113.7', userAgent: 'Fake browser' },
      ...data,
    } as Consent,
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
  notice = await text('marketingEmail', ago(30))
  someone = await payload.create({
    collection: 'people',
    data: { fullName: `${NAME} main` } as Person,
  })
})

afterAll(async () => {
  await removeTestData()
})

describe('who may read and record consents (docs/04, docs/05)', () => {
  it('lets owners and the operator read the log, and no other role', async () => {
    const entry = await consentOnTheSite(someone)
    for (const role of ROLES) {
      const read = payload.findByID({
        collection: 'consents',
        id: entry.id,
        user: verified(staff[role]),
        overrideAccess: false,
      })
      if (role === 'owner' || role === 'operator') await expect(read, role).resolves.toBeTruthy()
      else await expect(read, role).rejects.toThrow()
    }
    await expect(payload.find({ collection: 'consents', overrideAccess: false })).rejects.toThrow()
  })

  it('lets owners and the operator record a reply, with where its evidence is kept', async () => {
    for (const role of ROLES) {
      const recorded = payload.create({
        collection: 'consents',
        data: {
          person: someone.id,
          noticeVersion: notice.id,
          channel: 'email',
          grantedAt: ago(1),
          evidence: { reference: `fake-reply-${role}.eml` },
        } as Consent,
        user: verified(staff[role]),
        overrideAccess: false,
      })
      if (role === 'owner' || role === 'operator') {
        await expect(recorded, role).resolves.toMatchObject({
          purpose: 'marketingEmail',
          language: 'en-IN',
          channel: 'email',
        })
      } else {
        await expect(recorded, role).rejects.toThrow()
      }
    }
  })

  it('asks staff where a reply is kept, and takes a form’s consent without it', async () => {
    await expect(
      payload.create({
        collection: 'consents',
        data: { person: someone.id, noticeVersion: notice.id, channel: 'whatsapp' } as Consent,
        user: verified(staff.operator),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(consentOnTheSite(someone)).resolves.toBeTruthy()
  })
})

describe('an entry, once recorded', () => {
  it('is never changed, by anyone, even with access overridden', async () => {
    const entry = await consentOnTheSite(someone)
    await expect(
      payload.update({
        collection: 'consents',
        id: entry.id,
        data: { channel: 'email' },
        user: verified(staff.owner),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(
      payload.update({ collection: 'consents', id: entry.id, data: { channel: 'email' } }),
    ).rejects.toThrow()
    const after = await payload.findByID({ collection: 'consents', id: entry.id })
    expect(after.channel).toBe('web')
  })

  it('is never deleted, by anyone, even with access overridden', async () => {
    const entry = await consentOnTheSite(someone)
    await expect(
      payload.delete({
        collection: 'consents',
        id: entry.id,
        user: verified(staff.owner),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(payload.delete({ collection: 'consents', id: entry.id })).rejects.toThrow()
    await expect(payload.findByID({ collection: 'consents', id: entry.id })).resolves.toBeTruthy()
  })
})

describe('a withdrawal', () => {
  it('is an entry of its own that names the consent it ends, which stays as it was', async () => {
    const person = await payload.create({
      collection: 'people',
      data: { fullName: `${NAME} withdraws` } as Person,
    })
    const grant = await consentOnTheSite(person)
    expect(await consentFor(payload, person.id, 'marketingEmail')).toBe('granted')

    const withdrawal = await payload.create({
      collection: 'consents',
      data: {
        withdraws: grant.id,
        channel: 'phone',
        evidence: { form: 'Fake call to the office' },
      } as Consent,
      user: verified(staff.operator),
      overrideAccess: false,
    })
    expect(withdrawal).toMatchObject({
      purpose: 'marketingEmail',
      language: 'en-IN',
      channel: 'phone',
      grantedAt: grant.grantedAt,
    })
    expect(withdrawal.withdrawnAt).toBeTruthy()
    // Named by purpose and time, so the "Withdraws" picker and the log are readable.
    expect(grant.title).toMatch(/^Marketing email, given \d{1,2} \w+ \d{4} at /)
    expect(withdrawal.title).toMatch(/^Marketing email, withdrawn \d{1,2} \w+ \d{4} at /)
    expect(typeof withdrawal.person === 'object' ? withdrawal.person?.id : withdrawal.person).toBe(
      person.id,
    )

    // The consent is as it was given: the history is never lost (docs/12 §11).
    const kept = await payload.findByID({ collection: 'consents', id: grant.id, depth: 0 })
    expect(kept.withdrawnAt ?? null).toBeNull()
    expect(kept.channel).toBe('web')
    expect(await consentFor(payload, person.id, 'marketingEmail')).toBe('withdrawn')

    // Given again, it is granted again; the earlier entries stay.
    await consentOnTheSite(person)
    expect(await consentFor(payload, person.id, 'marketingEmail')).toBe('granted')
    const { totalDocs } = await payload.count({
      collection: 'consents',
      where: { person: { equals: person.id } },
    })
    expect(totalDocs).toBe(3)
  })

  it('ends a consent once: a second withdrawal is refused, by the database too', async () => {
    const grant = await consentOnTheSite(someone)
    await payload.create({
      collection: 'consents',
      data: { withdraws: grant.id, channel: 'web' } as Consent,
    })
    await expect(
      payload.create({
        collection: 'consents',
        data: { withdraws: grant.id, channel: 'web' } as Consent,
      }),
    ).rejects.toThrow()
    // A row complete in every other way: only the second withdrawal of one consent is wrong, and
    // Postgres refuses it as a unique violation (23505), whatever drizzle wraps it in.
    const refused = await payload.db.drizzle
      .execute(
        sql`INSERT INTO "consents"
              ("withdraws_id", "notice_version_id", "purpose", "language", "granted_at", "channel")
            VALUES (${grant.id}, ${notice.id}, 'marketingEmail', 'en-IN', now(), 'web')`,
      )
      .then(
        () => null,
        (error: { code?: string; cause?: { code?: string } }) => error,
      )
    expect(refused?.cause?.code ?? refused?.code).toBe('23505')
  })

  it('ends a consent, not another withdrawal', async () => {
    const grant = await consentOnTheSite(someone)
    const withdrawal = await payload.create({
      collection: 'consents',
      data: { withdraws: grant.id, channel: 'web' } as Consent,
    })
    await expect(
      payload.create({
        collection: 'consents',
        data: { withdraws: withdrawal.id, channel: 'web' } as Consent,
      }),
    ).rejects.toThrow()
  })
})

describe('the notice a consent names', () => {
  it('must be in force when the consent is given, and gives the consent its purpose', async () => {
    const later = await text('mapStorage', new Date(Date.now() + 30 * DAY).toISOString())
    await expect(consentOnTheSite(someone, { noticeVersion: later.id })).rejects.toThrow()
    // A reply staff record from before the notice took effect is refused too.
    await expect(
      payload.create({
        collection: 'consents',
        data: {
          person: someone.id,
          noticeVersion: notice.id,
          channel: 'email',
          grantedAt: ago(60),
          evidence: { reference: 'fake-old-reply.eml' },
        } as Consent,
      }),
    ).rejects.toThrow()
    await expect(
      consentOnTheSite(someone, { purpose: 'mapSharing' } as Partial<Consent>),
    ).rejects.toThrow()
  })

  it('is the one a form shows for its purpose: the version in force that took effect last', async () => {
    const newer = await text('marketingEmail', ago(1))
    // Far ahead, so that no run's text comes into force before a later run asks.
    await text('marketingEmail', new Date(Date.now() + 3650 * DAY).toISOString())
    const current = await currentNotice(payload, 'marketingEmail', 'en-IN')
    expect(current?.id).toBe(newer.id)
    expect(await currentNotice(payload, 'marketingEmail', 'hi-IN')).toBeNull()
  })

  it('never takes the deleted-record channel from anyone but a deletion', async () => {
    const grant = await consentOnTheSite(someone)
    await expect(
      payload.create({
        collection: 'consents',
        data: { withdraws: grant.id, channel: 'recordDeleted' } as Consent,
      }),
    ).rejects.toThrow()
  })
})

describe('the consent log', () => {
  it('is in the audit log as it is written, and shows on the person’s record', async () => {
    const person = await payload.create({
      collection: 'people',
      data: { fullName: `${NAME} record` } as Person,
    })
    const grant = await consentOnTheSite(person)
    const { docs } = await payload.find({
      collection: 'audit-log',
      where: { entity: { equals: 'consents' }, entityId: { equals: String(grant.id) } },
      overrideAccess: true,
    })
    expect(docs.map((entry) => entry.action)).toEqual(['create'])
    const record = await payload.findByID({
      collection: 'people',
      id: person.id,
      user: verified(staff.operator),
      overrideAccess: false,
    })
    expect(record.consents?.docs?.map((doc) => (typeof doc === 'object' ? doc.id : doc))).toEqual([
      grant.id,
    ])
  })
})
