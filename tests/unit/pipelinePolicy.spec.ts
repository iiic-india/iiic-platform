// @vitest-environment node
import type { Access, CollectionConfig, Field, FieldAccess } from 'payload'
import { describe, expect, it } from 'vitest'

import { ROLES, type Role } from '@/access/roles'
import { Enquiries } from '@/collections/Enquiries'
import { LeadActivities } from '@/collections/LeadActivities'
import { Leads } from '@/collections/Leads'
import { Organisations } from '@/collections/Organisations'
import { People } from '@/collections/People'
import { Proposals } from '@/collections/Proposals'
import { ProposalVersions } from '@/collections/ProposalVersions'
import { Tasks } from '@/collections/Tasks'
import { CONSENT_PURPOSES } from '@/lib/privacy/purposes'

// M4's collections held to docs/04 and docs/05 (docs/17 §2): leads are the office's and the
// owners' (S1); editors, practitioners and finance hold no lead data, though finance reads the
// organisations and proposals it invoices from. Every staff session here has entered its code.
type Outcome = 'all' | 'none'
type Requester = Role | 'anonymous' | 'deactivated owner'

function requester(who: Requester) {
  if (who === 'anonymous') return null
  if (who === 'deactivated owner') {
    return { id: 7, roles: ['owner'], active: false, _strategy: 'totp' }
  }
  return { id: 7, roles: [who], active: true, _strategy: 'totp' }
}

async function outcome(access: Access | undefined, user: ReturnType<typeof requester>) {
  const result = await access?.({ req: { user } } as Parameters<Access>[0])
  if (result === true) return 'all'
  if (result === false || result === undefined) return 'none'
  throw new Error(`unexpected query ${JSON.stringify(result)}`)
}

/** The roles that may; everyone else, visitors and deactivated accounts included, may not. */
function only(...roles: Role[]): Record<Requester, Outcome> {
  return {
    ...(Object.fromEntries(
      ROLES.map((role) => [role, roles.includes(role) ? 'all' : 'none']),
    ) as Record<Role, Outcome>),
    anonymous: 'none',
    'deactivated owner': 'none',
  }
}

const NOBODY = only()

const EXPECTED: [CollectionConfig, Record<string, ReturnType<typeof only>>][] = [
  [
    Organisations,
    {
      read: only('owner', 'operator', 'finance'),
      create: only('owner', 'operator'),
      update: only('owner', 'operator'),
      delete: only('owner'),
    },
  ],
  [
    Leads,
    {
      read: only('owner', 'operator'),
      create: only('owner', 'operator'),
      update: only('owner', 'operator'),
      delete: only('owner'),
    },
  ],
  [
    LeadActivities,
    {
      read: only('owner', 'operator'),
      create: only('owner', 'operator'),
      update: NOBODY,
      delete: only('owner'),
    },
  ],
  [
    Tasks,
    {
      read: only('owner', 'operator'),
      create: only('owner', 'operator'),
      update: only('owner', 'operator'),
      delete: only('owner'),
    },
  ],
  [
    Enquiries,
    {
      read: only('owner', 'operator'),
      // Made by the server alone, after the consent is recorded (CLAUDE.md #4).
      create: NOBODY,
      update: only('owner', 'operator'),
      delete: only('owner'),
    },
  ],
  [
    Proposals,
    {
      read: only('owner', 'operator', 'finance'),
      create: only('owner', 'operator'),
      update: only('owner', 'operator'),
      delete: only('owner'),
    },
  ],
  [
    ProposalVersions,
    {
      read: only('owner', 'operator', 'finance'),
      create: NOBODY,
      update: NOBODY,
      delete: NOBODY,
    },
  ],
]

describe('access to the pipeline by role (docs/05, docs/17 §2)', () => {
  for (const [collection, operations] of EXPECTED) {
    for (const [operation, byRole] of Object.entries(operations)) {
      it(`${collection.slug}.${operation}`, async () => {
        const access = (collection.access as Record<string, Access | undefined>)[operation]
        for (const [who, expected] of Object.entries(byRole)) {
          expect(await outcome(access, requester(who as Requester)), who).toBe(expected)
        }
      })
    }
  }

  it('leaves the two-factor check to payload-totp’s wrapper on every pipeline collection', () => {
    // No pipeline collection serves visitors, so none turns the wrapper off (src/access/policy.ts).
    for (const [collection] of EXPECTED) expect(collection.custom, collection.slug).toBeUndefined()
  })

  it('never lets a visitor or a deactivated account delete or read anything', async () => {
    for (const [collection] of EXPECTED) {
      for (const operation of ['read', 'delete'] as const) {
        const access = (collection.access as Record<string, Access | undefined>)[operation]
        expect(await outcome(access, requester('anonymous')), collection.slug).toBe('none')
        expect(await outcome(access, requester('deactivated owner')), collection.slug).toBe('none')
      }
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

async function allows(access: FieldAccess | undefined, who: Requester) {
  if (!access) return true
  return Boolean(await access({ req: { user: requester(who) } } as Parameters<FieldAccess>[0]))
}

const STAFF_AND_VISITORS = [...ROLES, 'anonymous', 'deactivated owner'] as const

describe('the fields the server keeps (docs/17 §2)', () => {
  it('lets only an owner set a proposal’s fees, and nobody type its total (docs/05: prices)', async () => {
    const proposal = fieldsOf(Proposals.fields)
    const feeRows = accessOf(proposal.get('fees'))
    const total = accessOf(proposal.get('feeTotalPaise'))
    for (const who of STAFF_AND_VISITORS) {
      const reads = ['owner', 'operator', 'finance'].includes(who)
      expect(await allows(feeRows?.read, who), `${who} reads the fees`).toBe(reads)
      expect(await allows(feeRows?.update, who), `${who} changes the fees`).toBe(who === 'owner')
      expect(await allows(feeRows?.create, who), `${who} sets the fees`).toBe(who === 'owner')
      expect(await allows(total?.read, who), `${who} reads the total`).toBe(reads)
      expect(await allows(total?.update, who), `${who} types the total`).toBe(false)
    }
  })

  it('keeps a version’s printed words and fees from editors, practitioners and visitors', async () => {
    const version = fieldsOf(ProposalVersions.fields)
    for (const name of ['document', 'feeTotalPaise']) {
      const access = accessOf(version.get(name))
      for (const who of STAFF_AND_VISITORS) {
        expect(await allows(access?.read, who), `${who} reads ${name}`).toBe(
          ['owner', 'operator', 'finance'].includes(who),
        )
        expect(await allows(access?.update, who), `${who} changes ${name}`).toBe(false)
      }
    }
  })

  it('hides the tracked link’s hash and the rate-limit hash from every read', () => {
    const hidden = (field: Field | undefined) => (field as { hidden?: boolean } | undefined)?.hidden
    expect(hidden(fieldsOf(ProposalVersions.fields).get('linkTokenHash'))).toBe(true)
    expect(hidden(fieldsOf(Enquiries.fields).get('submitterHash'))).toBe(true)
  })

  it('lets the office change nothing of an enquiry but its spam mark', async () => {
    const fields = fieldsOf(Enquiries.fields)
    const editable: string[] = []
    for (const [name, field] of fields) {
      if (field.type === 'row' || field.type === 'group') continue
      if ((field as { hidden?: boolean }).hidden) continue
      const access = accessOf(field)
      if (await allows(access?.update, 'operator')) editable.push(name)
    }
    expect(editable).toEqual(['status'])
  })

  it('lets nobody type what the platform records on a lead, a task or an activity', async () => {
    const serverFields: [CollectionConfig, string[]][] = [
      [
        Leads,
        [
          'title',
          'stageChangedAt',
          'calls',
          'previousLead',
          'touchedAt',
          'lastActivityAt',
          'closedAt',
          'alerts.untouched',
          'alerts.staleFor',
          'utm.source',
        ],
      ],
      [Tasks, ['doneAt', 'doneBy', 'automation', 'key']],
      [LeadActivities, ['by', 'fromStage', 'toStage', 'enquiry', 'proposalVersion', 'booking']],
      [Organisations, ['domain', 'nameKey']],
      [Proposals, ['reference', 'status', 'currentVersion', 'sentVersion', 'acceptedAt']],
    ]
    for (const [collection, names] of serverFields) {
      const fields = fieldsOf(collection.fields)
      for (const name of names) {
        const access = accessOf(fields.get(name))
        expect(access, `${collection.slug}.${name}`).toBeDefined()
        for (const who of ROLES) {
          expect(await allows(access?.update, who), `${who}: ${collection.slug}.${name}`).toBe(
            false,
          )
          expect(await allows(access?.create, who), `${who}: ${collection.slug}.${name}`).toBe(
            false,
          )
        }
      }
    }
  })
})

describe('what M4 adds to the trust layer (docs/17 §6)', () => {
  it('gives an enquiry a consent purpose of its own, never bundled with another', () => {
    expect(CONSENT_PURPOSES.map((purpose) => purpose.value)).toContain('enquiryReplies')
  })

  it('links a person to an organisation, which only the office reads (D-89)', () => {
    const fields = fieldsOf(People.fields)
    expect(fields.get('organisation')).toMatchObject({ relationTo: 'organisations' })
    // A practitioner reads a client's name, mobile and email only; tests/unit/policy.spec.ts
    // checks every other field of a person, these two included, is the office's alone.
    for (const name of ['organisation', 'jobTitle']) {
      expect(accessOf(fields.get(name))?.read, name).toBeDefined()
      expect(accessOf(fields.get(name))?.create, name).toBeUndefined()
      expect(accessOf(fields.get(name))?.update, name).toBeUndefined()
    }
  })
})
