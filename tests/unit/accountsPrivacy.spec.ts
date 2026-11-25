// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AccountSession } from '@/lib/accounts/contract'
import { decideSend } from '@/lib/messaging/policy'
import { consentState, type LedgerEntry } from '@/lib/privacy/consentLedger'
import { deadlinesFor } from '@/lib/privacy/deadlines'
import type { RequestType } from '@/lib/privacy/requests'
import { isNoindexPath } from '@/lib/seo/paths'

// My IIIC's privacy page (docs/20 §7.5; slice C): the ledger read over every record of the
// account, what may be given or withdrawn, the recent sign-in a copy, an erasure or closing needs
// (D-121), one open request of each kind, a withdrawal that stops the matching sends, and a
// second account that cannot touch the first's consents or requests. The server functions run
// against an in-memory stand-in for Payload, the actions with Next.js's redirect and headers
// faked. Obviously fake people and addresses only.

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`)
  }
}

const state = {
  env: { VERCEL_ENV: undefined as string | undefined },
  whatsapp: false,
  notices: { marketingEmail: 701, marketingWhatsapp: 702 } as Record<string, number | null>,
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({ env: () => state.env }))
vi.mock('@/lib/messaging/channelsFor', () => ({
  channelsFor: () => ({ configured: { email: true, whatsapp: state.whatsapp } }),
}))
vi.mock('@/lib/payments/store', () => ({
  inTransaction: async <T>(_req: unknown, work: () => Promise<T>) => work(),
}))
vi.mock('@/lib/automations/emit', () => ({ emitAutomationEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/monitoring/sentry', () => ({ reportError: vi.fn(async () => true) }))
vi.mock('@/lib/privacy/consents', () => ({
  currentNotice: vi.fn(async (_payload: unknown, purpose: string) => {
    const id = state.notices[purpose]
    return id ? { id, text: `Fake notice text for ${purpose}.` } : null
  }),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => {
    throw new Redirected(to)
  }),
}))
vi.mock('next/headers', () => ({
  headers: vi.fn(
    async () => new Headers({ 'user-agent': 'Fake browser', 'x-forwarded-for': '203.0.113.9' }),
  ),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => db.payload),
  createLocalReq: vi.fn(async ({ req }: { req?: { headers?: Headers } }) => ({
    payload: db.payload,
    headers: req?.headers ?? new Headers(),
    context: {},
  })),
}))
// Every seam is named here and none is loaded: the real ones are slice A's sign-in and slice B's
// scope (src/lib/accounts/privacy/seams.ts), which need Better Auth and an `accounts` collection
// this stand-in does not have. `ownPersonIds` answers as B's does over the stand-in's `people`:
// the account's own record and every record attached to it, sorted.
vi.mock('@/lib/accounts/privacy/seams', () => ({
  accountsOn: vi.fn(async () => true),
  openMyIiic: vi.fn(),
  getAccountSession: vi.fn(async () => null),
  requireAccount: vi.fn(),
  signOut: vi.fn(async () => {}),
  listDevices: vi.fn(async () => []),
  signOutEverywhere: vi.fn(async () => 2),
  closeAccount: vi.fn(async () => ({ ok: true, value: { closed: true } })),
  requestDetailCode: vi.fn(),
  confirmDetail: vi.fn(),
  whatsAppCodesOpen: vi.fn(async () => false),
  ownPersonIds: vi.fn(
    async (
      fake: { payload: { find: (query: object) => Promise<{ docs: { id: number }[] }> } },
      account: { accountId: number; personId: number },
    ) => {
      const { docs } = await fake.payload.find({
        collection: 'people',
        where: { account: { equals: account.accountId } },
      })
      return [...new Set([account.personId, ...docs.map((person) => person.id)])].sort(
        (a, b) => a - b,
      )
    },
  ),
}))

const rules = await import('@/lib/accounts/privacy/rules')
const { listOwnConsents, giveConsent, withdrawConsent } =
  await import('@/lib/accounts/privacy/consents')
const { createOwnRequest, listOwnRequests } = await import('@/lib/accounts/privacy/requests')
const outcome = await import('@/lib/accounts/privacy/outcome')
const copy = await import('@/lib/accounts/privacy/copy')
const actions = await import('@/lib/accounts/privacy/actions')
const seams = await import('@/lib/accounts/privacy/seams')
const { emitAutomationEvent } = await import('@/lib/automations/emit')

/** 4 May 2099, 11 AM in India: a day nothing else uses. */
const NOW = new Date('2099-05-04T11:00:00+05:30')
const MINUTE = 60_000
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * MINUTE)

// ---- An in-memory stand-in for the four collections these functions touch ----

type Doc = Record<string, unknown> & { id: number }
type Where = Record<string, unknown>

function matches(doc: Doc, where: Where | undefined): boolean {
  if (!where) return true
  if (Array.isArray(where.and)) return (where.and as Where[]).every((each) => matches(doc, each))
  return Object.entries(where).every(([field, condition]) => {
    const value = doc[field]
    const test = condition as Record<string, unknown>
    if ('equals' in test) return value != null && String(value) === String(test.equals)
    if ('in' in test) return (test.in as unknown[]).map(String).includes(String(value))
    if ('not_equals' in test) return String(value) !== String(test.not_equals)
    throw new Error(`the stand-in has no rule for ${field}`)
  })
}

class FakeDb {
  collections: Record<string, Doc[]> = {
    people: [],
    consents: [],
    'data-requests': [],
    subscribers: [],
  }
  next = 1000
  /** Set to make any read or write fail the test: the function should not have reached it. */
  sealed = false

  rows(collection: string): Doc[] {
    if (this.sealed) throw new Error(`the database was read (${collection})`)
    const rows = this.collections[collection]
    if (!rows) throw new Error(`the stand-in has no ${collection}`)
    return rows
  }

  payload = {
    find: async ({ collection, where }: { collection: string; where?: Where }) => ({
      docs: this.rows(collection).filter((doc) => matches(doc, where)),
    }),
    count: async ({ collection, where }: { collection: string; where?: Where }) => ({
      totalDocs: this.rows(collection).filter((doc) => matches(doc, where)).length,
    }),
    create: async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
      const rows = this.rows(collection)
      let doc: Doc = { ...data, id: this.next++ }
      if (collection === 'consents') doc = this.ledgerEntry(doc)
      if (collection === 'data-requests') {
        const clocks = deadlinesFor(data.type as RequestType, new Date(String(data.receivedAt)))
        doc = {
          ...doc,
          status: 'received',
          acknowledgeBy: clocks.acknowledgeBy.toISOString(),
          resolveBy: clocks.resolveBy.toISOString(),
        }
      }
      rows.push(doc)
      return doc
    },
    update: async ({ collection, id, data }: { collection: string; id: number; data: Doc }) => {
      const doc = this.rows(collection).find((row) => row.id === id)
      if (!doc) throw new Error('not found')
      Object.assign(doc, data)
      return doc
    },
  }

  /** As the ledger's own hook completes an entry (src/collections/Consents.ts). */
  ledgerEntry(doc: Doc): Doc {
    if (doc.withdraws != null) {
      const grant = this.collections.consents?.find((entry) => entry.id === doc.withdraws)
      if (!grant) throw new Error('no such consent')
      if (this.collections.consents?.some((entry) => entry.withdraws === grant.id)) {
        throw new Error('already withdrawn')
      }
      return {
        ...doc,
        person: grant.person,
        purpose: grant.purpose,
        grantedAt: grant.grantedAt,
        withdrawnAt: doc.withdrawnAt ?? NOW.toISOString(),
      }
    }
    const purpose = Object.entries(state.notices).find(([, id]) => id === doc.noticeVersion)?.[0]
    return { ...doc, purpose: purpose ?? doc.purpose }
  }

  person(id: number, extra: Record<string, unknown> = {}) {
    this.collections.people?.push({ id, fullName: `Example Client ${id}`, ...extra })
  }

  grant(person: number, purpose: string, grantedAt: Date) {
    const doc = { id: this.next++, person, purpose, grantedAt: grantedAt.toISOString() }
    this.collections.consents?.push(doc)
    return doc
  }

  ledgerOf(person: number): LedgerEntry[] {
    return (this.collections.consents ?? []).filter(
      (entry) => entry.person === person,
    ) as unknown as LedgerEntry[]
  }
}

let db: FakeDb

const req = (headers: Record<string, string> = {}) =>
  ({
    payload: db.payload,
    headers: new Headers({ 'user-agent': 'Fake browser', ...headers }),
    context: {},
  }) as never

/** The first account: own record 11, an earlier record 12 attached to it. */
const first = (over: Partial<AccountSession> = {}): AccountSession => ({
  accountId: 1,
  personId: 11,
  authUserId: 'fake-auth-user-1',
  sessionId: 'fake-session-1',
  signedInAt: ago(2),
  expiresAt: new Date(NOW.getTime() + 30 * 24 * 60 * MINUTE),
  trustedDevice: false,
  verified: { email: 'client@example.com', mobile: null },
  ...over,
})

/** A second account: own record 21 only. */
const second = (over: Partial<AccountSession> = {}): AccountSession =>
  first({
    accountId: 2,
    personId: 21,
    authUserId: 'fake-auth-user-2',
    sessionId: 'fake-session-2',
    verified: { email: 'other.client@example.com', mobile: null },
    ...over,
  })

beforeEach(() => {
  db = new FakeDb()
  db.person(11, { account: 1, email: 'client@example.com', ageBand: 'adult' })
  db.person(12, { account: 1, email: 'client@example.com' })
  db.person(13, { email: 'client@example.com' })
  db.person(21, { account: 2, email: 'other.client@example.com', ageBand: 'adult' })
  state.env = { VERCEL_ENV: undefined }
  state.whatsapp = false
  state.notices = { marketingEmail: 701, marketingWhatsapp: 702 }
  vi.clearAllMocks()
})

describe('where the account stands on a purpose, over every record (docs/20 §6)', () => {
  it('is in force while any record holds it, dated by the newest consent in force', () => {
    const entries = [
      { id: 1, person: 11, purpose: 'marketingEmail', grantedAt: ago(600).toISOString() },
      { id: 2, person: 12, purpose: 'marketingEmail', grantedAt: ago(300).toISOString() },
      {
        id: 3,
        person: 11,
        purpose: 'marketingEmail',
        grantedAt: ago(600).toISOString(),
        withdraws: 1,
        withdrawnAt: ago(100).toISOString(),
      },
    ]
    expect(rules.standingOf(entries, 'marketingEmail')).toEqual({
      state: 'granted',
      changedAt: ago(300),
    })
  })

  it('is withdrawn when no record holds it and one withdrew it, dated by the latest withdrawal', () => {
    const entries = [
      { id: 1, person: 11, purpose: 'testimonialPublication', grantedAt: ago(900).toISOString() },
      {
        id: 2,
        person: 11,
        purpose: 'testimonialPublication',
        grantedAt: ago(900).toISOString(),
        withdraws: 1,
        withdrawnAt: ago(60).toISOString(),
      },
    ]
    expect(rules.standingOf(entries, 'testimonialPublication')).toEqual({
      state: 'withdrawn',
      changedAt: ago(60),
    })
    expect(rules.standingOf(entries, 'marketingEmail')).toEqual({ state: 'none', changedAt: null })
  })
})

describe('what the page offers and lets the person withdraw (D-119)', () => {
  const facts = (over: Partial<Parameters<typeof rules.consentRows>[1]> = {}) => ({
    notices: { marketingEmail: 701, marketingWhatsapp: 702 },
    under18: false,
    verifiedEmail: true,
    verifiedMobile: false,
    whatsAppOpen: false,
    ...over,
  })
  const account = { id: 1, person: 11, purpose: 'account', grantedAt: ago(900).toISOString() }
  const map = { id: 2, person: 11, purpose: 'mapStorage', grantedAt: ago(800).toISOString() }

  it('lists what is on record, never offers a feature not built yet, and ends the account consent by closing', () => {
    const rows = rules.consentRows([account, map], facts())
    const byPurpose = Object.fromEntries(rows.map((row) => [row.purpose, row]))
    expect(byPurpose.account).toMatchObject({
      state: 'granted',
      canWithdraw: false,
      canGive: false,
    })
    expect(byPurpose.mapStorage).toMatchObject({ state: 'granted', canWithdraw: true })
    expect(rows.map((row) => row.purpose)).not.toContain('relatedProgrammes')
    expect(rows.filter((row) => row.canGive).map((row) => row.purpose)).toEqual(['marketingEmail'])
    expect(byPurpose.marketingEmail).toMatchObject({ state: 'none', noticeVersionId: 701 })
  })

  it('offers nothing to a record under 18, and nothing without its notice or its detail', () => {
    const offered = (over: Partial<Parameters<typeof rules.consentRows>[1]>) =>
      rules
        .consentRows([], facts(over))
        .filter((row) => row.canGive)
        .map((row) => row.purpose)
    expect(offered({ under18: true, verifiedMobile: true, whatsAppOpen: true })).toEqual([])
    expect(offered({ notices: { marketingEmail: null, marketingWhatsapp: 702 } })).toEqual([])
    expect(offered({ verifiedEmail: false })).toEqual([])
    // WhatsApp needs a verified mobile and the channel set up.
    expect(offered({ verifiedMobile: true })).toEqual(['marketingEmail'])
    expect(offered({ verifiedMobile: true, whatsAppOpen: true })).toEqual([
      'marketingEmail',
      'marketingWhatsapp',
    ])
  })

  it('offers no consent already in force, and never as ticked: the row carries no answer', () => {
    const given = { id: 3, person: 11, purpose: 'marketingEmail', grantedAt: ago(5).toISOString() }
    const row = rules
      .consentRows([given], facts())
      .find((each) => each.purpose === 'marketingEmail')
    expect(row).toMatchObject({ state: 'granted', canGive: false, canWithdraw: true })
    expect(row?.noticeVersionId).toBeNull()
  })
})

describe('a recent sign-in (D-121)', () => {
  it('counts up to ten minutes from the code, and not a moment more', () => {
    expect(rules.signedInRecently({ signedInAt: ago(9) }, NOW)).toBe(true)
    expect(rules.signedInRecently({ signedInAt: ago(10) }, NOW)).toBe(true)
    expect(rules.signedInRecently({ signedInAt: new Date(ago(10).getTime() - 1) }, NOW)).toBe(false)
    expect(rules.NEEDS_RECENT_SIGN_IN).toEqual(['access', 'erasure'])
  })
})

describe('ListOwnConsents', () => {
  it('reads the account’s own records only, and gives the notice’s words only with an offer', async () => {
    db.grant(11, 'account', ago(900))
    db.grant(13, 'marketingWhatsapp', ago(800)) // record 13 holds the address but no account
    db.grant(21, 'testimonialPublication', ago(700)) // the second account's
    const rows = await listOwnConsents(req(), first())
    expect(rows.map((row) => row.purpose)).toEqual(['marketingEmail', 'account'])
    const email = rows.find((row) => row.purpose === 'marketingEmail')
    expect(email).toMatchObject({ canGive: true, noticeVersionId: 701 })
    expect(email?.noticeText).toBe('Fake notice text for marketingEmail.')
    expect(rows.find((row) => row.purpose === 'account')?.noticeText).toBeNull()
  })
})

describe('WithdrawConsent', () => {
  it('withdraws the purpose on every record of the account at once, which stops the matching sends', async () => {
    db.grant(11, 'marketingEmail', ago(900))
    db.grant(12, 'marketingEmail', ago(800))
    db.grant(21, 'marketingEmail', ago(700))
    const result = await withdrawConsent(
      req({ 'x-forwarded-for': '203.0.113.7' }),
      first(),
      { purpose: 'marketingEmail' },
      NOW,
    )
    expect(result).toEqual({ ok: true, value: { withdrawn: 2 } })
    for (const person of [11, 12]) {
      const standing = consentState(db.ledgerOf(person), 'marketingEmail')
      expect(standing).toBe('withdrawn')
      // The messaging core reads the ledger before every promotional send (src/lib/messaging/try.ts).
      expect(
        decideSend({
          now: NOW,
          channel: 'email',
          kind: 'promotional',
          consent: standing,
          hasAddress: true,
          suppressed: false,
          under18: false,
          automationEnabled: true,
          channelConfigured: true,
          templateApproved: true,
        }),
      ).toEqual({ action: 'skip', reason: 'no-consent' })
    }
    // The second account's consent stands.
    expect(consentState(db.ledgerOf(21), 'marketingEmail')).toBe('granted')
    const withdrawals = db.collections.consents?.filter((entry) => entry.withdraws != null)
    expect(withdrawals).toHaveLength(2)
    expect(withdrawals?.[0]).toMatchObject({
      channel: 'web',
      evidence: { form: 'My IIIC', ip: '203.0.113.7', userAgent: 'Fake browser' },
    })
  })

  it('cannot reach another account’s consent, and says there is nothing to withdraw', async () => {
    db.grant(21, 'testimonialPublication', ago(700))
    expect(
      await withdrawConsent(req(), first(), { purpose: 'testimonialPublication' }, NOW),
    ).toEqual({ ok: false, error: { code: 'none-in-force' } })
    expect(consentState(db.ledgerOf(21), 'testimonialPublication')).toBe('granted')
  })

  it('leaves the account consent to closing, refuses an unknown purpose, and acts on no preview', async () => {
    db.grant(11, 'account', ago(900))
    expect(await withdrawConsent(req(), first(), { purpose: 'account' }, NOW)).toEqual({
      ok: false,
      error: { code: 'none-in-force' },
    })
    expect(await withdrawConsent(req(), first(), { purpose: 'everything' }, NOW)).toEqual({
      ok: false,
      error: { code: 'none-in-force' },
    })
    expect(consentState(db.ledgerOf(11), 'account')).toBe('granted')
    state.env = { VERCEL_ENV: 'preview' }
    db.sealed = true
    expect(await withdrawConsent(req(), first(), { purpose: 'marketingEmail' }, NOW)).toEqual({
      ok: false,
      error: { code: 'closed-here' },
    })
  })
})

describe('GiveConsent', () => {
  const journal = {
    purpose: 'marketingEmail' as const,
    noticeVersionId: 701,
    consent: true as const,
  }

  it('records the Journal’s consent under the notice in force, then the confirmed subscriber, once', async () => {
    const result = await giveConsent(
      req({ 'x-forwarded-for': '203.0.113.8' }),
      first(),
      journal,
      NOW,
    )
    expect(result.ok).toBe(true)
    const consent = db.collections.consents?.at(-1)
    expect(consent).toMatchObject({
      person: 11,
      noticeVersion: 701,
      purpose: 'marketingEmail',
      channel: 'web',
      grantedAt: NOW.toISOString(),
      evidence: { form: 'My IIIC', ip: '203.0.113.8', userAgent: 'Fake browser' },
    })
    expect(db.collections.subscribers).toEqual([
      expect.objectContaining({
        email: 'client@example.com',
        status: 'confirmed',
        source: 'My IIIC',
        person: 11,
        consent: consent?.id,
        notice: 701,
      }),
    ])
    expect(emitAutomationEvent).toHaveBeenCalledTimes(1)
    expect(emitAutomationEvent).toHaveBeenCalledWith(expect.anything(), {
      name: 'newsletter.confirmed',
      subscriberId: db.collections.subscribers?.[0]?.id,
    })
  })

  it('does not welcome a subscriber already confirmed again', async () => {
    db.collections.subscribers?.push({ id: 5, email: 'client@example.com', status: 'confirmed' })
    expect((await giveConsent(req(), first(), journal, NOW)).ok).toBe(true)
    expect(db.collections.subscribers?.[0]).toMatchObject({ status: 'confirmed', person: 11 })
    expect(emitAutomationEvent).not.toHaveBeenCalled()
  })

  it('refuses a changed notice, a consent already in force, and what My IIIC does not offer', async () => {
    expect(await giveConsent(req(), first(), { ...journal, noticeVersionId: 699 }, NOW)).toEqual({
      ok: false,
      error: { code: 'notice-changed' },
    })
    db.grant(12, 'marketingEmail', ago(30))
    expect(await giveConsent(req(), first(), journal, NOW)).toEqual({
      ok: false,
      error: { code: 'already-given' },
    })
    // No verified email: the Journal is offered after one is added.
    const noEmail = second({ verified: { email: null, mobile: '+919000000000' } })
    expect(await giveConsent(req(), noEmail, journal, NOW)).toEqual({
      ok: false,
      error: { code: 'closed-here' },
    })
    // Nothing is offered to a record under 18.
    db.person(22, { account: 2, ageBand: 'under18' })
    expect(await giveConsent(req(), second(), journal, NOW)).toEqual({
      ok: false,
      error: { code: 'closed-here' },
    })
    expect(db.collections.consents?.filter((entry) => entry.person === 21)).toHaveLength(0)
  })

  it('gives nothing on a preview', async () => {
    state.env = { VERCEL_ENV: 'preview' }
    db.sealed = true
    expect(await giveConsent(req(), first(), journal, NOW)).toEqual({
      ok: false,
      error: { code: 'closed-here' },
    })
  })
})

describe('CreateOwnRequest', () => {
  it('records a request for the account’s own record, verified by the session’s code, with its clocks', async () => {
    const result = await createOwnRequest(
      req(),
      first(),
      { type: 'correction', summary: '  Fake: my city is wrong.  ' },
      NOW,
    )
    expect(result).toEqual({
      ok: true,
      value: {
        requestId: expect.any(Number),
        acknowledgeBy: new Date(NOW.getTime() + 48 * 60 * MINUTE),
        resolveBy: new Date(NOW.getTime() + 30 * 24 * 60 * MINUTE),
      },
    })
    expect(db.collections['data-requests']?.[0]).toMatchObject({
      type: 'correction',
      person: 11,
      channel: 'web',
      receivedAt: NOW.toISOString(),
      summary: 'Fake: my city is wrong.',
      verifiedAt: NOW.toISOString(),
      verificationMethod: 'oneTimeCode',
      status: 'received',
    })
  })

  it('refuses a copy or an erasure on a stale sign-in before it reads anything (D-121)', async () => {
    db.sealed = true
    const stale = first({ signedInAt: ago(11) })
    for (const type of ['erasure', 'access'] as const) {
      expect(await createOwnRequest(req(), stale, { type, summary: 'Fake request.' }, NOW)).toEqual(
        { ok: false, error: { code: 'sign-in-again' } },
      )
    }
    db.sealed = false
    expect(db.collections['data-requests']).toHaveLength(0)
    // Other kinds need no recent sign-in.
    expect(
      (await createOwnRequest(req(), stale, { type: 'nomination', summary: 'Fake.' }, NOW)).ok,
    ).toBe(true)
    // A fresh sign-in may ask for erasure.
    expect(
      (await createOwnRequest(req(), first(), { type: 'erasure', summary: 'Fake.' }, NOW)).ok,
    ).toBe(true)
  })

  it('takes one open request of each kind at a time, over every record of the account', async () => {
    db.collections['data-requests']?.push({
      id: 9,
      type: 'access',
      person: 12,
      status: 'acknowledged',
    })
    expect(
      await createOwnRequest(req(), first(), { type: 'access', summary: 'Fake again.' }, NOW),
    ).toEqual({ ok: false, error: { code: 'open-request-exists' } })
    // A closed one does not count, and another account's open one is not this account's.
    db.collections['data-requests']?.push({ id: 10, type: 'erasure', person: 11, status: 'closed' })
    db.collections['data-requests']?.push({
      id: 11,
      type: 'erasure',
      person: 21,
      status: 'received',
    })
    expect(
      (await createOwnRequest(req(), first(), { type: 'erasure', summary: 'Fake.' }, NOW)).ok,
    ).toBe(true)
  })

  it('refuses words the request cannot keep, and acts on no preview', async () => {
    const long = 'x'.repeat(rules.SUMMARY_MAX + 1)
    expect(
      await createOwnRequest(req(), first(), { type: 'correction', summary: long }, NOW),
    ).toEqual({ ok: false, error: { code: 'invalid-input' } })
    expect(
      await createOwnRequest(req(), first(), { type: 'correction', summary: '   ' }, NOW),
    ).toEqual({ ok: false, error: { code: 'invalid-input' } })
    state.env = { VERCEL_ENV: 'preview' }
    db.sealed = true
    expect(
      await createOwnRequest(req(), first(), { type: 'correction', summary: 'Fake.' }, NOW),
    ).toEqual({ ok: false, error: { code: 'closed-here' } })
  })
})

describe('ListOwnRequests', () => {
  it('lists the requests of the account’s records and no one else’s', async () => {
    db.collections['data-requests']?.push(
      { id: 1, type: 'access', person: 12, status: 'received', receivedAt: ago(60).toISOString() },
      { id: 2, type: 'erasure', person: 21, status: 'received', receivedAt: ago(50).toISOString() },
    )
    expect((await listOwnRequests(req(), first())).map((row) => row.id)).toEqual([1])
    expect((await listOwnRequests(req(), second())).map((row) => row.id)).toEqual([2])
  })
})

describe('the page’s addresses carry codes, never the person', () => {
  it('round-trips an outcome and ignores what it does not know', () => {
    const href = outcome.outcomeHref({
      tone: 'done',
      code: 'withdrawn',
      section: 'agreed',
      purpose: 'marketingEmail',
    })
    expect(href).toBe(
      '/account/privacy?done=withdrawn&in=agreed&purpose=marketingEmail#outcome-agreed',
    )
    const params = Object.fromEntries(new URL(href, 'https://fake.example.invalid').searchParams)
    expect(outcome.readOutcome(params)).toEqual({
      tone: 'done',
      code: 'withdrawn',
      section: 'agreed',
      purpose: 'marketingEmail',
      count: null,
    })
    expect(outcome.readOutcome({ done: 'withdrawn', in: 'elsewhere' })).toBeNull()
    expect(outcome.readOutcome({ error: 'made-up', in: 'agreed' })).toBeNull()
    expect(
      outcome.readOutcome({ done: 'withdrawn', in: 'agreed', purpose: 'client@example.com' })
        ?.purpose,
    ).toBeNull()
  })

  it('are private: never indexed, never in the sitemap (D-67)', () => {
    for (const path of [
      outcome.PRIVACY_PATH,
      outcome.CLOSE_PATH,
      outcome.CLOSED_PATH,
      `${outcome.CONTACT_PATH}?channel=email`,
    ]) {
      expect(isNoindexPath(path), path).toBe(true)
    }
  })
})

describe('the server actions check the session before anything else (CLAUDE.md #6)', () => {
  /** A form whose fields must not be read: the session comes first. */
  const unread = new Proxy({} as FormData, {
    get() {
      throw new Error('the form was read before the session')
    },
  })
  const signedOut = () => {
    vi.mocked(seams.requireAccount).mockImplementation(async () => {
      throw new Redirected('/login')
    })
  }

  it('sends a signed-out person to sign in without reading the form', async () => {
    signedOut()
    const calls: Promise<unknown>[] = [
      actions.withdrawConsentAction(unread),
      actions.giveConsentAction(unread),
      actions.createRequestAction(
        {
          status: 'idle',
          errors: {},
          refusal: null,
          signInAgain: false,
          values: { type: '', summary: '' },
          key: 0,
        },
        unread,
      ),
      actions.signInAgainAction(unread),
      actions.signOutEverywhereAction(),
      actions.closeAccountAction(),
      actions.requestDetailAction(
        { status: 'idle', channel: 'email', value: '', masked: null, error: null, key: 0 },
        unread,
      ),
      actions.confirmDetailAction({ status: 'idle', error: null, key: 0 }, unread),
    ]
    for (const call of calls) await expect(call).rejects.toMatchObject({ to: '/login' })
  })

  const form = (fields: Record<string, string>) => {
    const data = new FormData()
    for (const [key, value] of Object.entries(fields)) data.set(key, value)
    return data
  }
  const signedIn = (account: AccountSession) =>
    vi.mocked(seams.requireAccount).mockImplementation(async () => account)

  it('withdraws, and sends the account consent to closing instead', async () => {
    signedIn(first())
    db.grant(11, 'marketingEmail', ago(900))
    await expect(
      actions.withdrawConsentAction(form({ purpose: 'marketingEmail' })),
    ).rejects.toMatchObject({
      to: '/account/privacy?done=withdrawn&in=agreed&purpose=marketingEmail#outcome-agreed',
    })
    await expect(actions.withdrawConsentAction(form({ purpose: 'account' }))).rejects.toMatchObject(
      {
        to: '/account/privacy/close',
      },
    )
  })

  it('records no consent when the box was left unticked', async () => {
    signedIn(first())
    await expect(
      actions.giveConsentAction(form({ purpose: 'marketingEmail', noticeVersionId: '701' })),
    ).rejects.toMatchObject({
      to: '/account/privacy?error=unticked&in=messages&purpose=marketingEmail#outcome-messages',
    })
    expect(db.collections.consents).toHaveLength(0)
  })

  it('keeps the words of a request refused for a stale sign-in, and offers to sign in again', async () => {
    signedIn(first({ signedInAt: new Date(Date.now() - 11 * MINUTE) }))
    const answer = await actions.createRequestAction(
      {
        status: 'idle',
        errors: {},
        refusal: null,
        signInAgain: false,
        values: { type: '', summary: '' },
        key: 0,
      },
      form({ type: 'erasure', summary: 'Fake: erase my data.' }),
    )
    expect(answer).toMatchObject({
      status: 'refused',
      signInAgain: true,
      values: { type: 'erasure', summary: 'Fake: erase my data.' },
      key: 1,
    })
    expect(db.collections['data-requests']).toHaveLength(0)
  })

  it('closes only after a recent sign-in, through A’s CloseAccount, then leads to the closed page', async () => {
    signedIn(first({ signedInAt: new Date(Date.now() - 11 * MINUTE) }))
    await expect(actions.closeAccountAction()).rejects.toMatchObject({
      to: '/account/privacy/close?error=sign-in-again&in=close#outcome-close',
    })
    expect(seams.closeAccount).not.toHaveBeenCalled()

    signedIn(first({ signedInAt: new Date(Date.now() - 2 * MINUTE) }))
    await expect(actions.closeAccountAction()).rejects.toMatchObject({
      to: '/account/privacy/closed',
    })
    expect(seams.closeAccount).toHaveBeenCalledWith(expect.anything(), {
      accountId: 1,
      reason: 'person',
    })
    expect(seams.signOut).toHaveBeenCalledTimes(1)
  })

  it('signs out every other device, and says how many', async () => {
    signedIn(first())
    await expect(actions.signOutEverywhereAction()).rejects.toMatchObject({
      to: '/account/privacy?done=signed-out&in=devices&count=2#outcome-devices',
    })
    expect(seams.signOutEverywhere).toHaveBeenCalledWith(expect.anything(), first())
  })

  it('checks a code’s shape before A sees it', async () => {
    signedIn(first())
    const answer = await actions.confirmDetailAction(
      { status: 'idle', error: null, key: 0 },
      form({ code: '12ab' }),
    )
    expect(answer).toEqual({ status: 'invalid', error: copy.DETAIL_COPY.codeInvalid, key: 1 })
    expect(seams.confirmDetail).not.toHaveBeenCalled()
  })
})

describe('the page’s words (VOICE.md; CLAUDE.md #3, #9)', () => {
  const strings: string[] = []
  const collect = (value: unknown) => {
    if (typeof value === 'string') strings.push(value)
    else if (typeof value === 'function') {
      for (const sample of [0, 1, 2, 3, 12]) collect((value as (n: number) => unknown)(sample))
    } else if (value && typeof value === 'object') Object.values(value).forEach(collect)
  }
  collect(copy)

  it('names no clinical word, makes no offer, shows no price and never exclaims', () => {
    const text = strings.join('\n').toLowerCase()
    for (const word of [
      'therapy',
      'therapist',
      'psychologist',
      'clinical',
      'diagnosis',
      'treatment',
      'hurry',
      'guarantee',
      '₹',
      '!',
    ]) {
      expect(text, word).not.toContain(word)
    }
  })

  it('says one to nine in words', () => {
    expect(copy.countWord(3)).toBe('three')
    expect(copy.countWord(12)).toBe('12')
    expect(copy.DEVICES_COPY.done(2)).toBe('Signed out of two other devices.')
    expect(copy.DETAIL_COPY.wrongCode(1)).toBe('That code doesn’t match. You have one try left.')
  })

  it('leaves the account notice to IIIC (I-65)', () => {
    expect(copy.ACCOUNT_NOTICE_TODO).toMatch(/^TODO: .*I-65$/)
  })

  it('has words for every outcome the page can be sent', () => {
    for (const code of outcome.DONE_CODES) {
      expect(
        copy.outcomeText({
          tone: 'done',
          code,
          section: 'agreed',
          purpose: 'marketingEmail',
          count: 1,
        }),
      ).not.toBe('')
    }
    for (const code of outcome.ERROR_CODES) {
      expect(
        copy.outcomeText({ tone: 'error', code, section: 'agreed', purpose: null, count: null }),
      ).not.toBe('')
    }
  })
})
