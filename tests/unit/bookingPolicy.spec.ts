// @vitest-environment node
import type { Access, CollectionConfig, Field, FieldAccess } from 'payload'
import { describe, expect, it } from 'vitest'

import { ROLES, type Role } from '@/access/roles'
import { AvailabilityExceptions } from '@/collections/AvailabilityExceptions'
import { AvailabilityRules } from '@/collections/AvailabilityRules'
import { Bookings } from '@/collections/Bookings'
import { BusyBlocks } from '@/collections/BusyBlocks'
import { CalendarConnections } from '@/collections/CalendarConnections'
import { Events } from '@/collections/Events'
import { GatewayEvents } from '@/collections/GatewayEvents'
import { Invoices } from '@/collections/Invoices'
import { Payments } from '@/collections/Payments'
import { PriceHistory } from '@/collections/PriceHistory'
import { Refunds } from '@/collections/Refunds'
import { Services } from '@/collections/Services'
import { Settings } from '@/globals/Settings'

// M3's collections held to docs/04 and docs/05 (docs/16 §2), as tests/unit/policy.spec.ts holds
// the earlier ones: `own` means only the documents of the practitioner's own profile; `active`
// means active documents only.
type Outcome = 'all' | 'own' | 'active' | 'none'
type Requester = Role | 'anonymous' | 'deactivated owner'

const USER_ID = 7

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
  if ('active' in result) {
    expect(result).toEqual({ active: { equals: true } })
    return 'active'
  }
  expect(result).toEqual({ 'practitioner.staff': { equals: USER_ID } })
  return 'own'
}

/** Owners, then the outcome of every other role unless named. */
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

const SERVER_ONLY = {
  create: row({ owner: 'none', staff: 'none' }),
  update: row({ owner: 'none', staff: 'none' }),
  delete: row({ owner: 'none', staff: 'none' }),
}

const PRACTITIONER_OWN = {
  read: row({ owner: 'all', staff: 'none', operator: 'all', practitioner: 'own' }),
  create: row({ owner: 'all', staff: 'none', operator: 'all' }),
  update: row({ owner: 'all', staff: 'none', operator: 'all', practitioner: 'own' }),
  delete: row({ owner: 'all', staff: 'none', operator: 'all', practitioner: 'own' }),
}

const EXPECTED: [CollectionConfig, Record<string, Record<Requester, Outcome>>][] = [
  [
    Bookings,
    {
      read: row({ owner: 'all', staff: 'none', operator: 'all', practitioner: 'own' }),
      create: row({ owner: 'all', staff: 'none', operator: 'all' }),
      update: row({ owner: 'all', staff: 'none', operator: 'all', practitioner: 'own' }),
      delete: row({ owner: 'none', staff: 'none' }),
    },
  ],
  [AvailabilityRules, PRACTITIONER_OWN],
  [AvailabilityExceptions, PRACTITIONER_OWN],
  [
    CalendarConnections,
    {
      read: row({ owner: 'all', staff: 'none', operator: 'all', practitioner: 'own' }),
      create: row({ owner: 'all', staff: 'none' }),
      update: row({ owner: 'all', staff: 'none' }),
      delete: row({ owner: 'all', staff: 'none' }),
    },
  ],
  [
    BusyBlocks,
    {
      read: row({ owner: 'all', staff: 'none', operator: 'all', practitioner: 'own' }),
      ...SERVER_ONLY,
    },
  ],
  [
    Events,
    {
      read: {
        ...row({ owner: 'all', staff: 'active', operator: 'all', practitioner: 'all' }),
        anonymous: 'active',
        'deactivated owner': 'active',
      },
      create: row({ owner: 'all', staff: 'none', operator: 'all' }),
      update: row({ owner: 'all', staff: 'none', operator: 'all' }),
      delete: row({ owner: 'all', staff: 'none' }),
    },
  ],
  [PriceHistory, { read: row({ owner: 'all', staff: 'none', operator: 'all', finance: 'all' }), ...SERVER_ONLY }],
  [Payments, { read: row({ owner: 'all', staff: 'none', operator: 'all', finance: 'all' }), ...SERVER_ONLY }],
  [GatewayEvents, { read: row({ owner: 'all', staff: 'none', finance: 'all' }), ...SERVER_ONLY }],
  [
    Refunds,
    {
      read: row({ owner: 'all', staff: 'none', operator: 'all', finance: 'all' }),
      create: row({ owner: 'all', staff: 'none', operator: 'all' }),
      update: row({ owner: 'all', staff: 'none', operator: 'all' }),
      delete: row({ owner: 'none', staff: 'none' }),
    },
  ],
  [Invoices, { read: row({ owner: 'all', staff: 'none', finance: 'all' }), ...SERVER_ONLY }],
]

describe('access to booking and money by role (docs/05, docs/16 §2)', () => {
  for (const [collection, operations] of EXPECTED) {
    for (const [operation, byRole] of Object.entries(operations)) {
      it(`${collection.slug}.${operation}`, async () => {
        const access = (collection.access as Record<string, Access | undefined>)[operation]
        for (const [who, expected] of Object.entries(byRole)) {
          expect(await outcome(access, requester(who as Requester)), `${who}`).toBe(expected)
        }
      })
    }
  }

  it('shows a visitor, or a session without its code, the active fixed-time sessions only', async () => {
    for (const strategy of ['local-jwt', null]) {
      expect(await outcome(Events.access?.read, requester('owner', strategy))).toBe('active')
    }
    expect(Events.custom).toEqual({ totp: { disableAccessWrapper: { read: true } } })
  })

  it('keeps payload-totp’s wrapper on every other new collection', () => {
    for (const [collection] of EXPECTED) {
      if (collection === Events) continue
      expect(collection.custom, collection.slug).toBeUndefined()
    }
  })
})

/** Every field of a collection, through rows, groups and arrays, by its dotted name. */
function fieldsOf(fields: readonly Field[], prefix = ''): Map<string, Field> {
  const found = new Map<string, Field>()
  for (const field of fields) {
    if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        for (const [inner, value] of fieldsOf(tab.fields, prefix)) found.set(inner, value)
      }
      continue
    }
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

const accessOf = (field: Field | undefined) =>
  field && 'access' in field ? field.access : undefined

async function allows(access: FieldAccess | undefined, user: ReturnType<typeof requester>) {
  if (!access) return true
  return Boolean(await access({ req: { user } } as Parameters<FieldAccess>[0]))
}

describe('the fields of a booking and a service that hold money (CLAUDE.md #5, D-21)', () => {
  const bookings = fieldsOf(Bookings.fields)

  it('lets the staff who see prices read a booking’s price, and nobody type it', async () => {
    const price = accessOf(bookings.get('price'))
    for (const who of [...ROLES, 'anonymous', 'deactivated owner'] as const) {
      const user = requester(who)
      expect(await allows(price?.read, user), `${who} reads`).toBe(
        ['owner', 'operator', 'finance'].includes(who),
      )
      expect(await allows(price?.update, user), `${who} updates`).toBe(false)
      expect(await allows(price?.create, user), `${who} creates`).toBe(false)
    }
  })

  it('hides the manage link’s hash and the checkout key from every read', () => {
    for (const name of ['manageTokenHash', 'checkoutKey']) {
      expect((bookings.get(name) as { hidden?: boolean } | undefined)?.hidden, name).toBe(true)
    }
  })

  it('keeps a service’s GST rate with its prices (D-21)', async () => {
    const rate = accessOf(fieldsOf(Services.fields).get('gstRateBasisPoints'))
    for (const who of [...ROLES, 'anonymous'] as const) {
      expect(await allows(rate?.read, requester(who)), who).toBe(
        ['owner', 'operator', 'finance'].includes(who),
      )
      expect(await allows(rate?.update, requester(who)), who).toBe(who === 'owner')
    }
  })

  it('leaves the refund threshold empty until IIIC sets one (docs/16 §10)', () => {
    const threshold = fieldsOf(Settings.fields).get('money.refundApprovalThresholdPaise')
    expect(threshold).toBeDefined()
    expect((threshold as { defaultValue?: unknown }).defaultValue).toBeUndefined()
  })
})
