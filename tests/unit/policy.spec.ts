// @vitest-environment node
import type { Access } from 'payload'
import { describe, expect, it } from 'vitest'

import { ROLES, type Role } from '@/access/roles'
import { Media } from '@/collections/Media'
import { Users } from '@/collections/Users'

// Every role held to docs/05 ("Who uses it"), through the access functions the collections
// actually use. `self` means only the person's own record.
type Outcome = 'all' | 'self' | 'none'
type Expected = Record<string, Record<Role | 'anonymous' | 'deactivated owner', Outcome>>

const EXPECTED: { users: Expected; media: Expected } = {
  users: {
    read: row({ owner: 'all', staff: 'self' }),
    create: row({ owner: 'all', staff: 'none' }),
    update: row({ owner: 'all', staff: 'self' }),
    // Staff are deactivated, never deleted (docs/04).
    delete: row({ owner: 'none', staff: 'none' }),
    unlock: row({ owner: 'all', staff: 'none' }),
  },
  media: {
    read: { ...row({ owner: 'all', staff: 'all' }), anonymous: 'all', 'deactivated owner': 'all' },
    create: row({ owner: 'all', staff: 'none', operator: 'all', editor: 'all' }),
    update: row({ owner: 'all', staff: 'none', operator: 'all', editor: 'all' }),
    delete: row({ owner: 'all', staff: 'none', editor: 'all' }),
  },
}

function row({
  owner,
  staff,
  ...overrides
}: { owner: Outcome; staff: Outcome } & Partial<Record<Exclude<Role, 'owner'>, Outcome>>) {
  const byRole: Partial<Record<Role, Outcome>> = overrides
  const outcomes = Object.fromEntries(
    ROLES.map((role) => [role, byRole[role] ?? (role === 'owner' ? owner : staff)]),
  ) as Record<Role, Outcome>
  return { ...outcomes, anonymous: 'none' as Outcome, 'deactivated owner': 'none' as Outcome }
}

const USER_ID = 7
function requester(who: Role | 'anonymous' | 'deactivated owner') {
  if (who === 'anonymous') return null
  if (who === 'deactivated owner') return { id: USER_ID, roles: ['owner'], active: false }
  return { id: USER_ID, roles: [who], active: true }
}

async function outcome(access: Access | undefined, who: Role | 'anonymous' | 'deactivated owner') {
  const result = await access?.({ req: { user: requester(who) } } as Parameters<Access>[0])
  if (result === true) return 'all'
  if (result === false || result === undefined) return 'none'
  expect(result).toEqual({ id: { equals: USER_ID } })
  return 'self'
}

const COLLECTIONS = { users: Users, media: Media } as const

describe('access by role (docs/05)', () => {
  for (const [slug, operations] of Object.entries(EXPECTED)) {
    const collection = COLLECTIONS[slug as keyof typeof COLLECTIONS]
    for (const [operation, byRole] of Object.entries(operations)) {
      it(`${slug}.${operation}`, async () => {
        const access = (collection.access as Record<string, Access | undefined>)[operation]
        for (const [who, expected] of Object.entries(byRole)) {
          expect(await outcome(access, who as Role), `${who} ${slug}.${operation}`).toBe(expected)
        }
      })
    }
  }
})
