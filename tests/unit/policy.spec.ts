// @vitest-environment node
import type { Access, CollectionConfig, Config } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ownerWithCode } from '@/access/policy'
import { ROLES, type Role } from '@/access/roles'
import { AnalyticsEvents } from '@/collections/AnalyticsEvents'
import { Consents } from '@/collections/Consents'
import { ConsentVersions } from '@/collections/ConsentVersions'
import { Media } from '@/collections/Media'
import { MissingPages } from '@/collections/MissingPages'
import { Pages } from '@/collections/Pages'
import { People } from '@/collections/People'
import { redirects } from '@/collections/Redirects'
import { Users } from '@/collections/Users'
import { Settings } from '@/globals/Settings'
import { revalidatePages } from '@/lib/content/revalidate'

vi.mock('@/lib/content/revalidate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/content/revalidate')>()),
  revalidatePages: vi.fn(),
}))

// Every role held to docs/05 ("Who uses it"), through the access functions the collections
// actually use. `self` means only the person's own record; `published` means published
// documents only, never a draft; `not in force` means only consent texts not yet in force.
type Outcome = 'all' | 'self' | 'published' | 'not in force' | 'none'
type Requester = Role | 'anonymous' | 'deactivated owner'
type Expected = Record<string, Record<Requester, Outcome>>

const EXPECTED: Record<keyof typeof COLLECTIONS, Expected> = {
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
  // Redirects are content (docs/05, Content): the staff who edit pages; visitors never read
  // them through the API, the site reads them on the server.
  redirects: {
    read: row({ owner: 'all', staff: 'none', operator: 'all', editor: 'all' }),
    create: row({ owner: 'all', staff: 'none', operator: 'all', editor: 'all' }),
    update: row({ owner: 'all', staff: 'none', operator: 'all', editor: 'all' }),
    delete: row({ owner: 'all', staff: 'none', editor: 'all' }),
  },
  // The 404 log (Content → Broken links): only the server adds entries.
  missingPages: {
    read: row({ owner: 'all', staff: 'none', operator: 'all', editor: 'all' }),
    create: row({ owner: 'none', staff: 'none' }),
    update: row({ owner: 'all', staff: 'none', operator: 'all', editor: 'all' }),
    delete: row({ owner: 'all', staff: 'none', editor: 'all' }),
  },
  // S2 (docs/04): the office and the owners; only an owner deletes (the erasure, docs/05).
  // Practitioners see their own clients once bookings link them (M3), so none yet.
  people: {
    read: row({ owner: 'all', staff: 'none', operator: 'all' }),
    create: row({ owner: 'all', staff: 'none', operator: 'all' }),
    update: row({ owner: 'all', staff: 'none', operator: 'all' }),
    delete: row({ owner: 'all', staff: 'none' }),
  },
  // Append-only (docs/04): read and recorded by the office; changed and deleted by nobody.
  consents: {
    read: row({ owner: 'all', staff: 'none', operator: 'all' }),
    create: row({ owner: 'all', staff: 'none', operator: 'all' }),
    update: row({ owner: 'none', staff: 'none' }),
    delete: row({ owner: 'none', staff: 'none' }),
  },
  // Content the operator reads and owners and editors write (docs/05); fixed once in force.
  consentVersions: {
    read: row({ owner: 'all', staff: 'none', operator: 'all', editor: 'all' }),
    create: row({ owner: 'all', staff: 'none', editor: 'all' }),
    update: row({ owner: 'not in force', staff: 'none', editor: 'not in force' }),
    delete: row({ owner: 'not in force', staff: 'none', editor: 'not in force' }),
  },
  // Written by the server only (docs/04, docs/12 §7); owners read them.
  analyticsEvents: {
    read: row({ owner: 'all', staff: 'none' }),
    create: row({ owner: 'none', staff: 'none' }),
    update: row({ owner: 'none', staff: 'none' }),
    delete: row({ owner: 'none', staff: 'none' }),
  },
}

/** The collection the redirects plugin adds (src/collections/Redirects.ts). */
const Redirects = (redirects({ collections: [] } as unknown as Config) as Config).collections?.find(
  (collection) => collection.slug === 'redirects',
) as CollectionConfig

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
  if ('effectiveFrom' in result) {
    // Worked out at the time of the request: the texts whose time has not come yet.
    const later = (result.effectiveFrom as { greater_than?: string }).greater_than ?? ''
    expect(Math.abs(Date.parse(later) - Date.now())).toBeLessThan(60_000)
    return 'not in force'
  }
  expect(result).toEqual({ id: { equals: USER_ID } })
  return 'self'
}

const COLLECTIONS = {
  users: Users,
  media: Media,
  pages: Pages,
  redirects: Redirects,
  missingPages: MissingPages,
  people: People,
  consents: Consents,
  consentVersions: ConsentVersions,
  analyticsEvents: AnalyticsEvents,
} as const

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

  it('lets only an owner who has entered their code run, queue or cancel jobs through the API', () => {
    const run = (who: Requester, strategy: string | null = 'totp') =>
      ownerWithCode({ req: { user: requester(who, strategy) } })
    expect(run('owner')).toBe(true)
    for (const who of ['operator', 'editor', 'practitioner', 'finance', 'anonymous'] as const) {
      expect(run(who), who).toBe(false)
    }
    expect(run('deactivated owner')).toBe(false)
    expect(run('owner', 'local-jwt')).toBe(false)
  })

  it('gives the settings to owners only (docs/04)', async () => {
    for (const operation of ['read', 'update'] as const) {
      const access = Settings.access?.[operation]
      for (const who of [...ROLES, 'anonymous', 'deactivated owner'] as const) {
        expect(await outcome(access, requester(who)), `${who} settings.${operation}`).toBe(
          who === 'owner' ? 'all' : 'none',
        )
      }
    }
  })

  it('keeps people and consents from every visitor, whatever they send', async () => {
    for (const collection of [People, Consents, ConsentVersions, AnalyticsEvents]) {
      for (const operation of ['read', 'create', 'update', 'delete'] as const) {
        const access = collection.access?.[operation]
        expect(await outcome(access, null), `${collection.slug}.${operation}`).toBe('none')
        // A request that claims a role without a user record behind it is no one.
        expect(
          await outcome(access, { roles: [], active: true } as never),
          `${collection.slug}.${operation}`,
        ).toBe('none')
      }
    }
  })

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
    // A draft: the redirects hook (src/lib/redirects/pageMoves.ts) acts only on a publish.
    for (const hook of Pages.hooks?.afterChange ?? []) {
      await hook({ doc: { slug: 'new' }, previousDoc: { slug: 'old' }, context: {} } as never)
    }
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
