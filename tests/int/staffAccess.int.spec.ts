import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ROLES, type Role } from '@/access/roles'
import type { User } from '@/payload-types'
import config from '@/payload.config'

// Roles and deactivation against the real database (docs/05). Obviously fake accounts.
let payload: Payload
const email = (label: string) => `int.access.${label}@example.invalid`
const PASSWORD = 'test-only-password-access'
const staff = {} as Record<Role, User>
/** A staff user as Payload sees them after they entered their two-factor code. */
const verified = (user: User) => ({ ...user, _strategy: 'totp' }) as User

async function removeTestAccounts() {
  await payload.delete({ collection: 'users', where: { email: { like: 'int.access.' } } })
  await payload.delete({ collection: 'media', where: { alt: { like: 'int.access.' } } })
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestAccounts()
  // The owner first: on an empty table the first account becomes the owner anyway.
  for (const role of ROLES) {
    staff[role] = await payload.create({
      collection: 'users',
      data: { name: `Fake ${role}`, email: email(role), password: PASSWORD, roles: [role] },
    })
  }
})

afterAll(async () => {
  await removeTestAccounts()
})

describe('staff access by role', () => {
  it('lets an owner see every staff account, and everyone else only their own', async () => {
    const all = await payload.find({
      collection: 'users',
      where: { email: { like: 'int.access.' } },
      user: verified(staff.owner),
      overrideAccess: false,
    })
    expect(all.totalDocs).toBe(ROLES.length)
    for (const role of ROLES.filter((role) => role !== 'owner')) {
      const visible = await payload.find({
        collection: 'users',
        user: verified(staff[role]),
        overrideAccess: false,
      })
      expect(
        visible.docs.map((doc) => doc.id),
        role,
      ).toEqual([staff[role].id])
    }
  })

  it('never deletes a staff account, not even for an owner', async () => {
    await expect(
      payload.delete({
        collection: 'users',
        id: staff.finance.id,
        user: verified(staff.owner),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('lets owners, operators and editors add media, and nobody else', async () => {
    for (const role of ROLES) {
      const attempt = payload.create({
        collection: 'media',
        data: { alt: `int.access.${role}` },
        filePath: 'src/brand/logo/png/favicon-32.png',
        user: verified(staff[role]),
        overrideAccess: false,
      })
      if (['owner', 'operator', 'editor'].includes(role))
        await expect(attempt, role).resolves.toBeTruthy()
      else await expect(attempt, role).rejects.toThrow()
    }
  })
})

describe('deactivation', () => {
  it('ends open sessions at once and refuses the next sign-in', async () => {
    const { token } = await payload.login({
      collection: 'users',
      data: { email: email('practitioner'), password: PASSWORD },
    })
    const headers = new Headers({ Authorization: `JWT ${token}` })
    expect((await payload.auth({ headers })).user?.id).toBe(staff.practitioner.id)

    await payload.update({
      collection: 'users',
      id: staff.practitioner.id,
      data: { active: false },
      user: verified(staff.owner),
      overrideAccess: false,
    })

    expect((await payload.auth({ headers })).user).toBeNull()
    await expect(
      payload.login({
        collection: 'users',
        data: { email: email('practitioner'), password: PASSWORD },
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('lets only an owner deactivate someone', async () => {
    await payload
      .update({
        collection: 'users',
        id: staff.finance.id,
        data: { active: false },
        user: verified(staff.editor),
        overrideAccess: false,
      })
      .catch(() => undefined)
    const finance = await payload.findByID({ collection: 'users', id: staff.finance.id })
    expect(finance.active).not.toBe(false)
  })

  it('keeps at least one active owner', async () => {
    const owners = await payload.find({
      collection: 'users',
      where: { and: [{ roles: { in: ['owner'] } }, { active: { equals: true } }] },
    })
    // On CI's empty database this file's owner is the only active one (integration files run
    // one at a time); a developer's database may hold real owners, and then the refusal
    // cannot be shown without touching them.
    if (owners.docs.every((doc) => doc.id === staff.owner.id)) {
      await expect(
        payload.update({
          collection: 'users',
          id: staff.owner.id,
          data: { active: false },
          user: verified(staff.owner),
          overrideAccess: false,
        }),
      ).rejects.toMatchObject({ status: 400 })
    }

    // With a second active owner, the first may step down.
    await payload.update({
      collection: 'users',
      id: staff.operator.id,
      data: { roles: ['owner'] },
      user: verified(staff.owner),
      overrideAccess: false,
    })
    const steppedDown = await payload.update({
      collection: 'users',
      id: staff.owner.id,
      data: { roles: ['editor'] },
      user: verified(staff.owner),
      overrideAccess: false,
    })
    expect(steppedDown.roles).toEqual(['editor'])
  })
})
