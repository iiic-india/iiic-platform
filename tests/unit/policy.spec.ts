// @vitest-environment node
import type { Access, Field, FieldAccess } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ROLES, type Role } from '@/access/roles'
import { Faqs } from '@/collections/Faqs'
import { Media } from '@/collections/Media'
import { Pages } from '@/collections/Pages'
import { Practitioners } from '@/collections/Practitioners'
import { Services } from '@/collections/Services'
import { Users } from '@/collections/Users'
import { revalidateFaqs, revalidatePages } from '@/lib/content/revalidate'

vi.mock('@/lib/content/revalidate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/content/revalidate')>()),
  revalidatePages: vi.fn(),
  revalidateFaqs: vi.fn(),
}))

// Every role held to docs/05 ("Who uses it"), through the access functions the collections
// actually use. `self` means only the person's own record; `published` means published
// documents only, never a draft; `active` means active documents only (a service offered now,
// a practitioner's profile shown on the site).
type Outcome = 'all' | 'self' | 'published' | 'active' | 'none'
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
  // Questions are drafted and published as pages are (docs/05: editors own FAQs, operators edit
  // content).
  faqs: {
    read: {
      ...row({ owner: 'all', staff: 'published', operator: 'all', editor: 'all' }),
      anonymous: 'published',
      'deactivated owner': 'published',
    },
    readVersions: row({ owner: 'all', staff: 'none', operator: 'all', editor: 'all' }),
    create: row({ owner: 'all', staff: 'none', operator: 'all', editor: 'all' }),
    update: row({ owner: 'all', staff: 'none', operator: 'all', editor: 'all' }),
    delete: row({ owner: 'all', staff: 'none', editor: 'all' }),
  },
  // A visitor reads an active profile; the staff who keep content keep them all (docs/04, docs/05).
  practitioners: {
    read: {
      ...row({ owner: 'all', staff: 'active', operator: 'all', editor: 'all' }),
      anonymous: 'active',
      'deactivated owner': 'active',
    },
    create: row({ owner: 'all', staff: 'none', operator: 'all', editor: 'all' }),
    update: row({ owner: 'all', staff: 'none', operator: 'all', editor: 'all' }),
    delete: row({ owner: 'all', staff: 'none' }),
  },
  // Services and prices are an owner's (docs/05: operators cannot change prices); a service is
  // retired, never deleted.
  services: {
    read: {
      ...row({ owner: 'all', staff: 'all' }),
      anonymous: 'active',
      'deactivated owner': 'active',
    },
    create: row({ owner: 'all', staff: 'none' }),
    update: row({ owner: 'all', staff: 'none' }),
    delete: row({ owner: 'none', staff: 'none' }),
  },
}

const COLLECTIONS = {
  users: Users,
  media: Media,
  pages: Pages,
  faqs: Faqs,
  practitioners: Practitioners,
  services: Services,
} as const

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
  if ('active' in result) {
    expect(result).toEqual({ active: { equals: true } })
    return 'active'
  }
  expect(result).toEqual({ id: { equals: USER_ID } })
  return 'self'
}

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

  it('gives such a session the published questions, active profiles and active services only', async () => {
    // These reads also run without payload-totp's wrapper, so each rule asks for the code.
    for (const role of ['owner', 'operator', 'editor'] as const) {
      for (const strategy of ['local-jwt', null]) {
        const user = requester(role, strategy)
        expect(await outcome(Faqs.access?.read, user), role).toBe('published')
        expect(await outcome(Practitioners.access?.read, user), role).toBe('active')
        expect(await outcome(Services.access?.read, user), role).toBe('active')
      }
    }
  })

  it('keeps those reads open to visitors, and every other operation behind the code', () => {
    for (const collection of [Faqs, Practitioners, Services]) {
      expect(collection.custom?.totp, collection.slug).toEqual({
        disableAccessWrapper: { read: true },
      })
    }
  })
})

/** Every field of a collection, through rows, groups and arrays, by its dotted name. */
function fieldsOf(fields: readonly Field[], prefix = ''): Map<string, Field> {
  const found = new Map<string, Field>()
  for (const field of fields) {
    const name = 'name' in field ? `${prefix}${field.name}` : prefix
    if ('name' in field) found.set(name, field)
    if ('fields' in field) {
      for (const [inner, value] of fieldsOf(field.fields, 'name' in field ? `${name}.` : prefix)) {
        found.set(inner, value)
      }
    }
  }
  return found
}

/** A field's own access rules, if it has any. */
const accessOf = (field: Field | undefined) =>
  field && 'access' in field ? field.access : undefined

/** What a field's access gives a requester: true when they may. */
async function fieldAllows(
  access: FieldAccess | undefined,
  user: ReturnType<typeof requester>,
): Promise<boolean> {
  if (!access) return true
  return Boolean(await access({ req: { user } } as Parameters<FieldAccess>[0]))
}

describe('the fields a visitor never reads (docs/04, docs/05)', () => {
  const services = fieldsOf(Services.fields)
  const practitioners = fieldsOf(Practitioners.fields)

  it.each([
    // Prices, their GST and the SAC code: never a visitor's (D-21); owners set them; the staff
    // who quote or account for them read them.
    ['options.price', ['owner', 'operator', 'finance'], ['owner']],
    ['options.gstInclusive', ['owner', 'operator', 'finance'], ['owner']],
    ['sacCode', ['owner', 'operator', 'finance'], ['owner']],
    // The booking rules: every staff role reads them; owners set them.
    ['bookingRules', ROLES, ['owner']],
  ] as const)('services: %s', async (name, readers, writers) => {
    const field = services.get(name)
    expect(field, name).toBeDefined()
    for (const who of [...ROLES, 'anonymous', 'deactivated owner'] as const) {
      const user = requester(who)
      expect(await fieldAllows(accessOf(field)?.read, user), `${who} reads`).toBe(
        (readers as readonly string[]).includes(who),
      )
      for (const operation of ['create', 'update'] as const) {
        expect(await fieldAllows(accessOf(field)?.[operation], user), `${who} ${operation}`).toBe(
          (writers as readonly string[]).includes(who),
        )
      }
    }
    // A session that has entered only its password reads none of them.
    expect(await fieldAllows(accessOf(field)?.read, requester('owner', 'local-jwt'))).toBe(false)
  })

  it('keeps a service’s public fields public: its name, kind, address, register, format and lengths', () => {
    for (const name of [
      'name',
      'type',
      'slug',
      'register',
      'format',
      'options.duration',
      'active',
    ]) {
      expect(accessOf(services.get(name)), name).toBeUndefined()
    }
  })

  it('keeps every price in integer paise: a whole number, never below nothing', async () => {
    const price = services.get('options.price')
    expect(price?.type).toBe('number')
    const validate = price && 'validate' in price ? price.validate : undefined
    const options = { req: {}, required: false, min: 0 } as never
    expect(await validate?.(150000 as never, options)).toBe(true)
    expect(await validate?.(1500.5 as never, options)).toMatch(/whole number/)
  })

  it('practitioners: the staff account behind a profile is staff data, which an owner links', async () => {
    const staff = practitioners.get('staff')
    for (const who of [...ROLES, 'anonymous', 'deactivated owner'] as const) {
      const user = requester(who)
      expect(await fieldAllows(accessOf(staff)?.read, user), `${who} reads`).toBe(
        ['owner', 'operator', 'editor'].includes(who),
      )
      expect(await fieldAllows(accessOf(staff)?.update, user), `${who} updates`).toBe(
        who === 'owner',
      )
    }
    // The public profile's fields stay public.
    for (const name of ['publicName', 'photo', 'credentials', 'bio', 'services', 'active']) {
      expect(accessOf(practitioners.get(name)), name).toBeUndefined()
    }
  })
})

describe('the FAQs collection', () => {
  const revalidate = vi.mocked(revalidateFaqs)
  beforeEach(() => {
    revalidate.mockClear()
  })

  it('marks the questions of the page a question moved to, and of the one it left, stale', async () => {
    await Faqs.hooks?.afterChange?.[0]?.({
      doc: { page: 'organisations/team-map' },
      previousDoc: { page: 'organisations' },
    } as never)
    expect(revalidate.mock.calls).toEqual([['organisations/team-map', 'organisations']])
  })

  it('marks a deleted question’s page stale', async () => {
    await Faqs.hooks?.afterDelete?.[0]?.({ doc: { page: 'counselling' } } as never)
    expect(revalidate.mock.calls).toEqual([['counselling']])
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
