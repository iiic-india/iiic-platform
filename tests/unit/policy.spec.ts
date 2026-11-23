// @vitest-environment node
import type { Access, CollectionConfig, Config, Field, FieldAccess } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ownerWithCode } from '@/access/policy'
import { ROLES, type Role } from '@/access/roles'
import { AnalyticsEvents } from '@/collections/AnalyticsEvents'
import { Consents } from '@/collections/Consents'
import { ConsentVersions } from '@/collections/ConsentVersions'
import { Faqs } from '@/collections/Faqs'
import { Media } from '@/collections/Media'
import { MissingPages } from '@/collections/MissingPages'
import { Pages } from '@/collections/Pages'
import { People } from '@/collections/People'
import { Posts } from '@/collections/Posts'
import { Practitioners } from '@/collections/Practitioners'
import { redirects } from '@/collections/Redirects'
import { Services } from '@/collections/Services'
import { Testimonials } from '@/collections/Testimonials'
import { Topics } from '@/collections/Topics'
import { Users } from '@/collections/Users'
import { Settings } from '@/globals/Settings'
import {
  revalidateFaqs,
  revalidatePages,
  revalidatePosts,
  revalidateTopics,
} from '@/lib/content/revalidate'

vi.mock('@/lib/content/revalidate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/content/revalidate')>()),
  revalidatePages: vi.fn(),
  revalidateFaqs: vi.fn(),
  revalidatePosts: vi.fn(),
  revalidateTopics: vi.fn(),
}))

// Every role held to docs/05 ("Who uses it"), through the access functions the collections
// actually use. `self` means only the person's own record; `published` means published
// documents only, never a draft; `not in force` means only consent texts not yet in force;
// `active` means active documents only (a service offered now, a practitioner's profile shown on
// the site); `own clients` means only the people who have a booking with the practitioner.
type Outcome =
  'all' | 'self' | 'published' | 'not in force' | 'active' | 'shown' | 'own clients' | 'none'
type Requester = Role | 'anonymous' | 'deactivated owner'
type Expected = Record<string, Record<Requester, Outcome>>

/** Published content: the staff who edit content read drafts, everyone else what is published. */
const PUBLISHED_CONTENT: Expected = {
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
}

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
  // The Journal's articles, as pages (docs/05: editors hold pages, posts, FAQs and media).
  posts: PUBLISHED_CONTENT,
  // Topics have no drafts: anyone reads them; the staff who edit content write them.
  topics: {
    read: { ...row({ owner: 'all', staff: 'all' }), anonymous: 'all', 'deactivated owner': 'all' },
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
  // The 404 log (Content → Broken links): only the server adds entries.
  missingPages: {
    read: row({ owner: 'all', staff: 'none', operator: 'all', editor: 'all' }),
    create: row({ owner: 'none', staff: 'none' }),
    update: row({ owner: 'all', staff: 'none', operator: 'all', editor: 'all' }),
    delete: row({ owner: 'all', staff: 'none', editor: 'all' }),
  },
  // S2 (docs/04): the office and the owners; only an owner deletes (the erasure, docs/05). A
  // practitioner reads the people who have a booking with them (the owner, 22 November 2026).
  people: {
    read: row({ owner: 'all', staff: 'none', operator: 'all', practitioner: 'own clients' }),
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
  // Reviews (docs/05, Proof): the operator moderates, owners publish (the collection checks who
  // publishes); a visitor, and every other role, reads a published review's card only.
  testimonials: {
    read: {
      ...row({ owner: 'all', staff: 'shown', operator: 'all' }),
      anonymous: 'shown',
      'deactivated owner': 'shown',
    },
    create: row({ owner: 'all', staff: 'none', operator: 'all' }),
    update: row({ owner: 'all', staff: 'none', operator: 'all' }),
    delete: row({ owner: 'all', staff: 'none' }),
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
  if ('active' in result) {
    expect(result).toEqual({ active: { equals: true } })
    return 'active'
  }
  if ('bookings.practitioner.staff' in result) {
    // Through the person's bookings: those whose practitioner profile is the requester's.
    expect(result).toEqual({ 'bookings.practitioner.staff': { equals: USER_ID } })
    return 'own clients'
  }
  if ('status' in result) {
    // A review's own status, not a draft's: the published reviews only.
    expect(result).toEqual({ status: { equals: 'published' } })
    return 'shown'
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
  faqs: Faqs,
  practitioners: Practitioners,
  services: Services,
  posts: Posts,
  topics: Topics,
  testimonials: Testimonials,
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

  it('gives a session that has not entered its two-factor code the published pages and articles only', async () => {
    // Pages.read and Posts.read run without payload-totp's wrapper, so visitors can read; a
    // password alone, or a new account with no authenticator yet, must not open the drafts
    // (docs/08 §9).
    for (const collection of [Pages, Posts]) {
      for (const role of ['owner', 'operator', 'editor'] as const) {
        for (const strategy of ['local-jwt', null]) {
          expect(
            await outcome(collection.access?.read, requester(role, strategy)),
            `${collection.slug}: ${role} with ${strategy ?? 'no strategy'}`,
          ).toBe('published')
        }
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

  it('keeps payload-totp’s wrapper off reading alone, for the collections visitors read', () => {
    for (const collection of [Pages, Posts, Topics, Media]) {
      expect(collection.custom, collection.slug).toEqual({
        totp: { disableAccessWrapper: { read: true } },
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

  it('people: a practitioner reads a client’s name, mobile and email, and nothing else (the owner, 22 November 2026)', async () => {
    const people = fieldsOf(People.fields)
    const shared = ['fullName', 'mobile', 'email']
    for (const name of shared) {
      expect(people.get(name), name).toBeDefined()
      expect(accessOf(people.get(name))?.read, name).toBeUndefined()
    }
    // Every other field on the record, including any added later, is the office's alone. A
    // group's own rule covers the fields inside it.
    const others = [...people.keys()].filter(
      (name) => !shared.includes(name) && !shared.some((top) => name.startsWith(`${top}.`)),
    )
    expect(others).toEqual(expect.arrayContaining(['ageBand', 'city', 'consents', 'bookings']))
    for (const name of others.filter((name) => !name.includes('.'))) {
      const read = accessOf(people.get(name))?.read
      expect(read, name).toBeDefined()
      for (const who of [...ROLES, 'anonymous', 'deactivated owner'] as const) {
        expect(await fieldAllows(read, requester(who)), `${who} reads ${name}`).toBe(
          ['owner', 'operator'].includes(who),
        )
      }
      expect(await fieldAllows(read, requester('operator', 'local-jwt')), name).toBe(false)
    }
  })

  const testimonials = fieldsOf(Testimonials.fields)

  it('testimonials: the record behind the card is the moderating staff’s, never a visitor’s', async () => {
    for (const name of [
      'person',
      'intakeRef',
      'themes',
      'translator',
      'source',
      'receivedOn',
      'originalReference',
      'screening',
      'consent',
      'notes',
    ]) {
      const field = testimonials.get(name)
      expect(field, name).toBeDefined()
      for (const who of [...ROLES, 'anonymous', 'deactivated owner'] as const) {
        const user = requester(who)
        const staff = ['owner', 'operator'].includes(who)
        expect(await fieldAllows(accessOf(field)?.read, user), `${name}: ${who} reads`).toBe(staff)
        expect(await fieldAllows(accessOf(field)?.update, user), `${name}: ${who}`).toBe(staff)
      }
      expect(await fieldAllows(accessOf(field)?.read, requester('owner', 'local-jwt'))).toBe(false)
    }
  })

  it('testimonials: the organisation, translation, excerpt, photograph and link show only when agreed', async () => {
    const reads = (name: string, doc: Record<string, unknown>) =>
      accessOf(testimonials.get(name))?.read?.({ req: { user: null }, doc } as never)
    for (const [name, flag] of [
      ['organisation', 'showOrganisation'],
      ['translation', 'translationApproved'],
      ['excerpt', 'excerptApproved'],
      ['photo', 'photoAgreed'],
      ['profileLink', 'profileLinkAgreed'],
    ] as const) {
      expect(await reads(name, { [flag]: false }), name).toBe(false)
      expect(await reads(name, {}), name).toBe(false)
      expect(await reads(name, { [flag]: true }), name).toBe(true)
    }
    // The card's own fields stay public.
    for (const name of [
      'shownName',
      'designation',
      'place',
      'programme',
      'year',
      'text',
      'doors',
    ]) {
      expect(accessOf(testimonials.get(name))?.read, name).toBeUndefined()
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

describe('the Journal’s collections', () => {
  beforeEach(() => {
    vi.mocked(revalidatePosts).mockClear()
    vi.mocked(revalidateTopics).mockClear()
  })

  it('marks a changed article stale at its new and its old address, and a deleted one', async () => {
    await Posts.hooks?.afterChange?.[0]?.({
      doc: { slug: 'fake-new' },
      previousDoc: { slug: 'fake-old' },
    } as never)
    await Posts.hooks?.afterDelete?.[0]?.({ doc: { slug: 'fake-gone' } } as never)
    expect(vi.mocked(revalidatePosts).mock.calls).toEqual([['fake-new', 'fake-old'], ['fake-gone']])
  })

  it('marks the topics stale, and the articles that show them, when a topic changes or goes', async () => {
    await Topics.hooks?.afterChange?.[0]?.({ doc: { slug: 'fake-topic' } } as never)
    await Topics.hooks?.afterDelete?.[0]?.({ doc: { slug: 'fake-topic' } } as never)
    expect(vi.mocked(revalidateTopics)).toHaveBeenCalledTimes(2)
  })

  it('keeps drafts and versions for articles, as for pages', () => {
    expect(Posts.versions).toEqual(Pages.versions)
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
