// @vitest-environment node
import type { Access, CollectionConfig } from 'payload'
import { describe, expect, it } from 'vitest'

import { ROLES, type Role } from '@/access/roles'
import { VIEW_POLICY, viewRefusal, type AdminView } from '@/access/views'
import { CaseStudies } from '@/collections/CaseStudies'
import { Certificates } from '@/collections/Certificates'
import { DataRequests } from '@/collections/DataRequests'
import { Feedback } from '@/collections/Feedback'
import { Incidents } from '@/collections/Incidents'
import { SessionNotes } from '@/collections/SessionNotes'

/**
 * M5's collections and views held to docs/05 ("Who uses it") and docs/18: every role, an
 * anonymous visitor, a deactivated owner and a session without the two-factor code.
 */

type Requester = Role | 'anonymous' | 'deactivated owner'

const staff = (roles: Role[], extra: Record<string, unknown> = {}) => ({
  id: 7,
  collection: 'users',
  roles,
  active: true,
  _strategy: 'totp',
  ...extra,
})

const requester = (who: Requester) => {
  if (who === 'anonymous') return null
  if (who === 'deactivated owner') return staff(['owner'], { active: false })
  return staff([who])
}

const REQUESTERS: Requester[] = [...ROLES, 'anonymous', 'deactivated owner']

/** What an access function answers, as `all`, `none` or `own` (a query on the author). */
async function outcome(access: Access | undefined, user: unknown) {
  if (!access) throw new Error('missing access function')
  const result = await access({ req: { user } } as Parameters<Access>[0])
  if (result === true) return 'all'
  if (result === false) return 'none'
  if (JSON.stringify(result) === JSON.stringify({ author: { equals: 7 } })) return 'own'
  if (JSON.stringify(result) === JSON.stringify({ status: { equals: 'published' } })) {
    return 'published'
  }
  return JSON.stringify(result)
}

type Expected = Record<'read' | 'create' | 'update' | 'delete', Partial<Record<Requester, string>>>

/** Every requester not named gets `fallback`. */
const by = (named: Partial<Record<Requester, string>>, fallback = 'none') =>
  Object.fromEntries(REQUESTERS.map((who) => [who, named[who] ?? fallback])) as Record<
    Requester,
    string
  >

const office = { owner: 'all', operator: 'all' }

const CASES: [CollectionConfig, Expected][] = [
  [
    SessionNotes,
    {
      // The author's own, whatever the role: an owner reads only the notes they wrote.
      read: by({
        owner: 'own',
        operator: 'own',
        practitioner: 'own',
        editor: 'own',
        finance: 'own',
      }),
      create: by({}),
      update: by({}),
      delete: by({}),
    },
  ],
  [Certificates, { read: by(office), create: by({}), update: by({}), delete: by({}) }],
  [DataRequests, { read: by(office), create: by(office), update: by(office), delete: by({}) }],
  [Incidents, { read: by(office), create: by(office), update: by(office), delete: by({}) }],
  [
    Feedback,
    { read: by(office), create: by({}), update: by(office), delete: by({ owner: 'all' }) },
  ],
  [
    CaseStudies,
    {
      read: by({ ...office, editor: 'all' }, 'published'),
      create: by({ ...office, editor: 'all' }),
      update: by({ ...office, editor: 'all' }),
      delete: by({ owner: 'all' }),
    },
  ],
]

describe('M5 collections: who may do what (docs/05, docs/18)', () => {
  for (const [collection, expected] of CASES) {
    for (const operation of ['read', 'create', 'update', 'delete'] as const) {
      it(`${collection.slug}: ${operation}`, async () => {
        const access = collection.access?.[operation] as Access | undefined
        const got = Object.fromEntries(
          await Promise.all(
            REQUESTERS.map(async (who) => [who, await outcome(access, requester(who))] as const),
          ),
        )
        expect(got).toEqual(expected[operation])
      })
    }
  }

  it('session notes: no note without the two-factor code, even for its author', async () => {
    const read = SessionNotes.access?.read as Access
    expect(await outcome(read, staff(['practitioner'], { _strategy: 'local-jwt' }))).toBe('none')
  })

  it('session notes: the query names the requester, never another author', async () => {
    const read = SessionNotes.access?.read as Access
    const result = await read({
      req: { user: staff(['practitioner'], { id: 12 }) },
    } as unknown as Parameters<Access>[0])
    expect(result).toEqual({ author: { equals: 12 } })
  })

  it('session notes: the body is hidden from every read and written by the server only', () => {
    const sealed = SessionNotes.fields.find((field) => 'name' in field && field.name === 'sealed')
    expect(sealed).toMatchObject({ hidden: true })
    expect(SessionNotes.admin?.hidden).toBe(true)
  })

  it('certificates: the verify token is stored only as a hidden hash', () => {
    const hash = Certificates.fields.find(
      (field) => 'name' in field && field.name === 'verifyTokenHash',
    )
    expect(hash).toMatchObject({ hidden: true, unique: true })
  })
})

describe('M5 views: the user, the code and the role first (CLAUDE.md #6)', () => {
  const views = Object.keys(VIEW_POLICY) as AdminView[]

  it('refuses an anonymous request with 401 on every view', () => {
    for (const view of views) {
      expect(viewRefusal(null, view)).toEqual({ status: 401, code: 'sign-in' })
      expect(viewRefusal(undefined, view)).toEqual({ status: 401, code: 'sign-in' })
    }
  })

  it('refuses a customer or any account that is not staff', () => {
    for (const view of views) {
      expect(viewRefusal({ id: 1, collection: 'accounts', roles: ['owner'] }, view)?.status).toBe(
        401,
      )
    }
  })

  it('asks for the two-factor code before anything else', () => {
    for (const view of views) {
      expect(viewRefusal(staff(['owner'], { _strategy: 'local-jwt' }), view)).toEqual({
        status: 403,
        code: 'enter-code',
      })
    }
  })

  it('refuses a deactivated account', () => {
    for (const view of views) {
      expect(viewRefusal(staff(['owner'], { active: false }), view)?.code).toBe('not-allowed')
    }
  })

  it('lets each role into its own views only', () => {
    const expected: Record<AdminView, Role[]> = {
      today: ['owner', 'operator', 'practitioner'],
      calendar: ['owner', 'operator', 'practitioner'],
      reschedule: ['owner', 'operator'],
      reports: ['owner'],
      search: ['owner', 'operator', 'practitioner', 'finance'],
      person: ['owner', 'operator', 'practitioner'],
      proof: ['owner', 'operator'],
      privacy: ['owner', 'operator'],
      privacyDecision: ['owner'],
      settings: ['owner'],
      notes: ['practitioner'],
      certificatesIssue: ['owner', 'operator'],
      certificatesRevoke: ['owner'],
      invoicePdf: ['owner', 'finance'],
      // Release 2 (docs/20 §8; D-127): ending a My IIIC account's sessions.
      accountSessions: ['owner'],
    }
    for (const view of views) {
      const allowed = ROLES.filter((role) => viewRefusal(staff([role]), view) === null)
      expect({ view, allowed }).toEqual({ view, allowed: expected[view] })
    }
  })

  it('never lets an editor or finance near notes, people, privacy or proof', () => {
    for (const view of ['notes', 'person', 'privacy', 'proof'] as const) {
      expect(viewRefusal(staff(['editor']), view)?.code).toBe('not-allowed')
      expect(viewRefusal(staff(['finance']), view)?.code).toBe('not-allowed')
    }
  })

  it('lets an owner who also counsels write notes, through the practitioner role', () => {
    expect(viewRefusal(staff(['owner', 'practitioner']), 'notes')).toBeNull()
    expect(viewRefusal(staff(['owner']), 'notes')?.code).toBe('not-allowed')
  })
})
