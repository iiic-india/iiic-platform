// @vitest-environment node
import type { Access } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ROLES, type Role } from '@/access/roles'
import { Media } from '@/collections/Media'
import { Pages } from '@/collections/Pages'
import { Users } from '@/collections/Users'
import { revalidatePages } from '@/lib/content/revalidate'

vi.mock('@/lib/content/revalidate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/content/revalidate')>()),
  revalidatePages: vi.fn(),
}))

// Every role held to docs/05 ("Who uses it"), through the access functions the collections
// actually use. `self` means only the person's own record; `published` means published
// documents only, never a draft.
type Outcome = 'all' | 'self' | 'published' | 'none'
type Requester = Role | 'anonymous' | 'deactivated owner'
type Expected = Record<string, Record<Requester, Outcome>>

const EXPECTED: { users: Expected; media: Expected; pages: Expected } = {
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
  pages: {
    // Drafts are for the staff who edit content; everyone else reads what is published.
    read: {
      ...row({ owner: 'all', staff: 'published', operator: 'all', editor: 'all' }),
      anonymous: 'published',
      'deactivated owner': 'published',
    },
    // Earlier versions hold every draft, so they go to the same staff.
    readVersions: row({ owner: 'all', staff: 'none', operator: 'all', editor: 'all' }),
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
/**
 * The user on a request. Staff sessions have entered their two-factor code ('totp'), as every
 * admin session must; `strategy` gives a session at another step, null one with no strategy.
 */
function requester(who: Requester, strategy: string | null = 'totp') {
  if (who === 'anonymous') return null
  const user =
    who === 'deactivated owner'
      ? { id: USER_ID, roles: ['owner'], active: false }
      : { id: USER_ID, roles: [who], active: true }
  return strategy ? { ...user, _strategy: strategy } : user
}

async function outcome(access: Access | undefined, user: ReturnType<typeof requester>) {
  const result = await access?.({ req: { user } } as Parameters<Access>[0])
  if (result === true) return 'all'
  if (result === false || result === undefined) return 'none'
  if ('_status' in result) {
    expect(result).toEqual({ _status: { equals: 'published' } })
    return 'published'
  }
  expect(result).toEqual({ id: { equals: USER_ID } })
  return 'self'
}

const COLLECTIONS = { users: Users, media: Media, pages: Pages } as const

describe('access by role (docs/05)', () => {
  for (const [slug, operations] of Object.entries(EXPECTED)) {
    const collection = COLLECTIONS[slug as keyof typeof COLLECTIONS]
    for (const [operation, byRole] of Object.entries(operations)) {
      it(`${slug}.${operation}`, async () => {
        const access = (collection.access as Record<string, Access | undefined>)[operation]
        for (const [who, expected] of Object.entries(byRole)) {
          expect(
            await outcome(access, requester(who as Requester)),
            `${who} ${slug}.${operation}`,
          ).toBe(expected)
        }
      })
    }
  }

  it('gives a session that has not entered its two-factor code the published pages only', async () => {
    // Pages.read runs without payload-totp's wrapper, so visitors can read; a password alone,
    // or a new account with no authenticator yet, must not open the drafts (docs/08 §9).
    for (const role of ['owner', 'operator', 'editor'] as const) {
      for (const strategy of ['local-jwt', null]) {
        expect(
          await outcome(Pages.access?.read, requester(role, strategy)),
          `${role} with ${strategy ?? 'no strategy'}`,
        ).toBe('published')
      }
    }
  })
})

describe('the pages collection', () => {
  const revalidate = vi.mocked(revalidatePages)
  beforeEach(() => {
    revalidate.mockClear()
  })

  it('marks a changed page stale at its new and its old address', async () => {
    await Pages.hooks?.afterChange?.[0]?.({
      doc: { slug: 'new' },
      previousDoc: { slug: 'old' },
    } as never)
    expect(revalidate.mock.calls).toEqual([['new', 'old']])
  })

  it('marks a deleted page stale', async () => {
    await Pages.hooks?.afterDelete?.[0]?.({ doc: { slug: 'gone' } } as never)
    expect(revalidate.mock.calls).toEqual([['gone']])
  })

  it('keeps a title short enough for the browser tab, which adds " · IIIC" (docs/12 §3)', () => {
    const title = Pages.fields.find((field) => 'name' in field && field.name === 'title')
    expect(title && 'maxLength' in title ? title.maxLength : undefined).toBe(53)
  })
})
