import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ROLES, type Role } from '@/access/roles'
import type { ConsentVersion, User } from '@/payload-types'
import config from '@/payload.config'

// The consent texts (docs/04 `consent_versions`; docs/12 §11) against the real database: who may
// read and write them (docs/05, Content), their numbering, and a text that never changes once
// it is in force. Texts in force are kept for good, so each run adds its own; the texts not yet
// in force are deleted at the end. Obviously fake staff and texts.
let payload: Payload
const email = (label: string) => `int.versions.${label}@example.invalid`
const PASSWORD = 'test-only-password-versions'
const TEXT = 'Fake consent text (int.versions)'
const staff = {} as Record<Role, User>
/** A staff user as Payload sees them after they entered their two-factor code. */
const verified = (user: User) => ({ ...user, collection: 'users', _strategy: 'totp' }) as User
const DAY = 86_400_000
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString()

async function removeTestData() {
  // Only the texts not yet in force can go: the rest are kept, as consents name them.
  await payload.delete({
    collection: 'consent-versions',
    where: {
      and: [{ text: { like: 'int.versions' } }, { effectiveFrom: { greater_than: inDays(0) } }],
    },
  })
  await payload.delete({ collection: 'users', where: { email: { like: 'int.versions.' } } })
}

const draft = (data: Partial<ConsentVersion> = {}, user?: User) =>
  payload.create({
    collection: 'consent-versions',
    data: {
      purpose: 'testimonialPublication',
      language: 'gu-IN',
      text: `${TEXT}, written ahead.`,
      effectiveFrom: inDays(30),
      ...data,
    } as ConsentVersion,
    ...(user ? { user: verified(user), overrideAccess: false } : {}),
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
})

afterAll(async () => {
  await removeTestData()
})

describe('who may read and write the consent texts', () => {
  it('lets owners, the operator and editors read them, and no other role', async () => {
    const text = await draft()
    for (const role of ROLES) {
      const read = payload.findByID({
        collection: 'consent-versions',
        id: text.id,
        user: verified(staff[role]),
        overrideAccess: false,
      })
      if (['owner', 'operator', 'editor'].includes(role)) {
        await expect(read, role).resolves.toBeTruthy()
      } else {
        await expect(read, role).rejects.toThrow()
      }
    }
    await expect(
      payload.find({ collection: 'consent-versions', overrideAccess: false }),
    ).rejects.toThrow()
  })

  it('lets owners and editors write them, and not the operator, who changes no policy', async () => {
    for (const role of ROLES) {
      const written = draft({}, staff[role])
      if (role === 'owner' || role === 'editor') await expect(written, role).resolves.toBeTruthy()
      else await expect(written, role).rejects.toThrow()
    }
    const text = await draft()
    await expect(
      payload.update({
        collection: 'consent-versions',
        id: text.id,
        data: { text: `${TEXT}, changed by the operator.` },
        user: verified(staff.operator),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })
})

describe('a consent text', () => {
  it('is numbered by its purpose and language, and named by them', async () => {
    const first = await draft({ purpose: 'relatedProgrammes', language: 'hi-IN' })
    const second = await draft({ purpose: 'relatedProgrammes', language: 'hi-IN' })
    expect(second.version).toBe(first.version + 1)
    expect(second.title).toBe(`Suggesting related programmes, version ${second.version} (Hindi)`)
    // Another language counts on its own, and leaves this one's count where it was.
    const gujarati = await draft({ purpose: 'relatedProgrammes', language: 'gu-IN' })
    const gujaratiNext = await draft({ purpose: 'relatedProgrammes', language: 'gu-IN' })
    expect(gujaratiNext.version).toBe(gujarati.version + 1)
    // The number is the platform's: one typed in is replaced.
    const typed = await draft({
      purpose: 'relatedProgrammes',
      language: 'hi-IN',
      version: 1,
    })
    expect(typed.version).toBe(second.version + 1)
  })

  it('can be changed or deleted while it is not yet in force', async () => {
    const text = await draft({}, staff.editor)
    const changed = await payload.update({
      collection: 'consent-versions',
      id: text.id,
      data: { text: `${TEXT}, changed before it is in force.` },
      user: verified(staff.editor),
      overrideAccess: false,
    })
    expect(changed.text).toBe(`${TEXT}, changed before it is in force.`)
    await expect(
      payload.delete({
        collection: 'consent-versions',
        id: text.id,
        user: verified(staff.editor),
        overrideAccess: false,
      }),
    ).resolves.toBeTruthy()
  })

  it('keeps its purpose and language once written: another purpose is another text', async () => {
    const text = await draft({ purpose: 'marketingWhatsapp' })
    const changed = await payload.update({
      collection: 'consent-versions',
      id: text.id,
      data: { purpose: 'marketingEmail', language: 'en-IN' },
      user: verified(staff.owner),
      overrideAccess: false,
    })
    expect(changed).toMatchObject({ purpose: 'marketingWhatsapp', language: 'gu-IN' })
  })

  it('never changes and is never deleted once in force, by anyone, even with access overridden', async () => {
    const text = await draft({
      purpose: 'mapSharing',
      language: 'en-IN',
      text: `${TEXT}, in force.`,
      effectiveFrom: inDays(-1),
    })
    for (const role of ['owner', 'editor'] as const) {
      await expect(
        payload.update({
          collection: 'consent-versions',
          id: text.id,
          data: { text: `${TEXT}, changed in force.` },
          user: verified(staff[role]),
          overrideAccess: false,
        }),
        role,
      ).rejects.toThrow()
      await expect(
        payload.delete({
          collection: 'consent-versions',
          id: text.id,
          user: verified(staff[role]),
          overrideAccess: false,
        }),
        role,
      ).rejects.toThrow()
    }
    await expect(
      payload.update({
        collection: 'consent-versions',
        id: text.id,
        data: { text: `${TEXT}, changed in force.` },
      }),
    ).rejects.toThrow()
    await expect(payload.delete({ collection: 'consent-versions', id: text.id })).rejects.toThrow()
    const kept = await payload.findByID({ collection: 'consent-versions', id: text.id })
    expect(kept.text).toBe(`${TEXT}, in force.`)
  })

  it('writes its changes to the audit log', async () => {
    const text = await draft({}, staff.owner)
    await payload.update({
      collection: 'consent-versions',
      id: text.id,
      data: { text: `${TEXT}, audited.` },
      user: verified(staff.owner),
      overrideAccess: false,
    })
    const { docs } = await payload.find({
      collection: 'audit-log',
      where: { entity: { equals: 'consent-versions' }, entityId: { equals: String(text.id) } },
      sort: '-at',
      overrideAccess: true,
    })
    expect(docs.map((entry) => entry.action)).toEqual(['update', 'create'])
    expect(docs[0]?.changed).toBe('text')
  })
})
