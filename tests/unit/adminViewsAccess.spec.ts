// @vitest-environment node
import type { PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ROLES, type Role } from '@/access/roles'
import { VIEW_POLICY, type AdminView } from '@/access/views'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/notes/notes', () => ({ countNotesForOwner: vi.fn() }))
vi.mock('@/lib/privacy/stepUp', () => ({ enterCodeAgain: vi.fn() }))

const { loadToday } = await import('@/lib/adminViews/today')
const { loadCalendar } = await import('@/lib/adminViews/calendar')
const { loadReports } = await import('@/lib/adminViews/reports')
const { searchAdmin } = await import('@/lib/adminViews/search')
const { loadPersonTimeline } = await import('@/lib/adminViews/timeline')
const { loadProof } = await import('@/lib/adminViews/proof')
const { loadSettings, exportAuditCsv } = await import('@/lib/adminViews/settings')
const { auditCsvHandler } = await import('@/lib/adminViews/endpoints')
const { enterCodeAgain } = await import('@/lib/privacy/stepUp')

// Every custom view of slice C refuses first (CLAUDE.md #6; docs/18 §1, §9): no staff session,
// a session without the two-factor code, a deactivated account and every role the view is not
// for are each refused before the loader touches the database. The database here throws on any
// use, so a read before the refusal fails the test. The signed-in paths, and a practitioner seeing
// only their own day and clients, are proved against Postgres in tests/int/adminViews.int.spec.ts.

/** A Payload that fails the test if anything reads it. */
const untouchable = new Proxy(
  {},
  {
    get(_target, key) {
      throw new Error(`the loader read payload.${String(key)} before it refused`)
    },
  },
)

const reqAs = (user: unknown) => ({ user, payload: untouchable }) as unknown as PayloadRequest

const staff = (roles: Role[], extra: Record<string, unknown> = {}) => ({
  id: 7,
  collection: 'users',
  roles,
  active: true,
  _strategy: 'totp',
  ...extra,
})

const LOADERS: Record<
  Exclude<
    AdminView,
    | 'reschedule'
    | 'privacy'
    | 'privacyDecision'
    | 'notes'
    | 'certificatesIssue'
    | 'certificatesRevoke'
    | 'invoicePdf'
  >,
  (req: PayloadRequest) => Promise<unknown>
> = {
  today: (req) => loadToday(req, new Date('2027-01-04T04:00:00Z')),
  calendar: (req) => loadCalendar(req, { day: '2027-01-04' }),
  reports: (req) => loadReports(req, {}),
  search: (req) => searchAdmin(req, { q: 'ab' }),
  person: (req) => loadPersonTimeline(req, 1),
  proof: (req) => loadProof(req),
  settings: (req) => loadSettings(req, {}),
}

beforeEach(() => vi.mocked(enterCodeAgain).mockReset())

describe('each view of slice C', () => {
  for (const [view, load] of Object.entries(LOADERS) as [
    keyof typeof LOADERS,
    (req: PayloadRequest) => Promise<unknown>,
  ][]) {
    describe(view, () => {
      it('refuses a visitor with no staff session', async () => {
        expect(await load(reqAs(null))).toEqual({
          ok: false,
          error: { code: 'refused', refusal: { status: 401, code: 'sign-in' } },
        })
        expect(await load(reqAs({ id: 1, collection: 'people', roles: ['owner'] }))).toMatchObject({
          error: { refusal: { code: 'sign-in' } },
        })
      })

      it('refuses a session without the two-factor code', async () => {
        const noCode = staff([...VIEW_POLICY[view]], { _strategy: 'local-jwt' })
        expect(await load(reqAs(noCode))).toEqual({
          ok: false,
          error: { code: 'refused', refusal: { status: 403, code: 'enter-code' } },
        })
      })

      it('refuses a deactivated account, even an owner', async () => {
        expect(await load(reqAs(staff(['owner'], { active: false })))).toMatchObject({
          error: { code: 'refused', refusal: { status: 403, code: 'not-allowed' } },
        })
      })

      it('refuses every role it is not for', async () => {
        const wrong = ROLES.filter((role) => !(VIEW_POLICY[view] as readonly Role[]).includes(role))
        for (const role of wrong) {
          expect(await load(reqAs(staff([role]))), role).toMatchObject({
            error: { code: 'refused', refusal: { status: 403, code: 'not-allowed' } },
          })
        }
      })
    })
  }

  it('leaves Reports and Settings to owners, and search open to finance', () => {
    expect(VIEW_POLICY.reports).toEqual(['owner'])
    expect(VIEW_POLICY.settings).toEqual(['owner'])
    expect(VIEW_POLICY.search).toContain('finance')
    expect(VIEW_POLICY.proof).not.toContain('practitioner')
  })
})

describe('the audit log CSV', () => {
  it('refuses before the code is checked, for anyone but an owner with the code', async () => {
    for (const user of [
      null,
      staff(['owner'], { _strategy: 'local-jwt' }),
      staff(['operator']),
      staff(['finance']),
    ]) {
      const result = await exportAuditCsv(reqAs(user), { code: '123456' })
      expect(result).toMatchObject({ ok: false, error: { code: 'refused' } })
    }
    expect(enterCodeAgain).not.toHaveBeenCalled()
  })

  it('refuses an owner whose code is wrong, before reading the log', async () => {
    vi.mocked(enterCodeAgain).mockResolvedValue({ ok: false, error: { code: 'wrong-code' } })
    expect(await exportAuditCsv(reqAs(staff(['owner'])), { code: '000000' })).toEqual({
      ok: false,
      error: { code: 'wrong-code' },
    })
  })

  it('answers a visitor with 401, never cached', async () => {
    const req = Object.assign(reqAs(null), { json: async () => ({ code: '123456' }) })
    const response = await auditCsvHandler(req)
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(await response.json()).toMatchObject({ code: 'sign-in' })
  })

  it('refuses before it reads the body (M7)', async () => {
    for (const user of [null, staff(['operator']), staff(['owner'], { _strategy: 'local-jwt' })]) {
      const json = vi.fn(async () => ({ code: '123456' }))
      const response = await auditCsvHandler(Object.assign(reqAs(user), { json }))
      expect(response.status).toBeGreaterThanOrEqual(401)
      expect(json).not.toHaveBeenCalled()
    }
  })
})
