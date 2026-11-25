// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import type { PayloadRequest } from 'payload'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AccountSession } from '@/lib/accounts/contract'
import { countsPath } from '@/lib/analytics/beacon'

// My IIIC's records (docs/20 §7.1 to §7.4, §8; D-118, D-127): every query in src/lib/accounts is
// kept to the account's own records, and a second account's booking, certificate and invoice
// answer "not found" exactly as one that does not exist; a change to a booking goes through M3's
// own functions as the client, after the ownership check; no amount and no invoice PDF while
// prices are hidden; each download is written to the audit log in the account's name before the
// file is handed back; /login and /account are never counted by the beacon. The database is a
// small fake that answers Payload's `find` from rows in memory; every person, booking and
// document is obviously fake.

vi.mock('server-only', () => ({}))
vi.mock('@payload-config', () => ({ default: {} }))
// The pages' door and request are given by each test; the scoped readers stay the real ones.
vi.mock('@/lib/accounts/scope', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/accounts/scope')>()),
  openMyIiic: vi.fn(),
  accountRequest: vi.fn(),
}))
// The privacy pages' own session read, given by the test that needs a signed-in person.
vi.mock('@/lib/accounts/privacy/seams', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/accounts/privacy/seams')>()),
  getAccountSession: vi.fn(async () => null),
}))
vi.mock('@/lib/monitoring/sentry', () => ({ reportError: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
// The site's cached flags, which only the header's "Log in" reads.
vi.mock('@/lib/settings/read', () => ({ getFlags: vi.fn() }))
// The settings as the door reads them, fresh at each request (readFlags over getPayload's
// findGlobal); everything else of Payload stays real.
const { storedFlags } = vi.hoisted(() => ({ storedFlags: { accountsEnabled: false } }))
vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  getPayload: vi.fn(async () => ({ findGlobal: async () => ({ flags: { ...storedFlags } }) })),
}))
vi.mock('@/lib/env', () => ({
  env: () => ({ siteUrl: 'https://fake.example.invalid', VERCEL_ENV: undefined }),
}))
vi.mock('@/lib/booking/api', () => ({ listSlots: vi.fn() }))
vi.mock('@/lib/booking/changes', () => ({ cancelBooking: vi.fn(), rescheduleBooking: vi.fn() }))
vi.mock('@/lib/booking/guard', () => ({
  inTransaction: async (_req: unknown, work: () => Promise<unknown>) => work(),
  keepOk: (result: { ok: boolean }) => result.ok,
}))
vi.mock('@/lib/booking/load', () => ({
  loadRules: vi.fn(async () => ({
    ok: true,
    value: {
      noticeHours: 0,
      horizonDays: 7,
      bufferMinutes: 0,
      holdMinutes: 10,
      rescheduleWindowHours: 1,
      refundSteps: [{ hoursBefore: 1, refundPercent: 100 }],
    },
  })),
  paidPaiseFor: vi.fn(async () => 0),
}))
vi.mock('@/lib/bookingFlow/clientRefund', () => ({
  refundableOnChain: vi.fn(async () => 0),
  requestClientRefund: vi.fn(async () => ({
    refundIds: [],
    toSend: [],
    awaitingOwner: false,
    requestedPaise: 0,
  })),
}))
vi.mock('@/lib/bookingFlow/guards', () => ({ bookingsStoreHere: vi.fn(() => true) }))
vi.mock('@/lib/calendar/bookingInvite', () => ({ bookingInvite: vi.fn() }))
vi.mock('@/lib/payments/records', () => ({
  readPaymentSettings: vi.fn(async () => ({
    flags: { pricesPublic: false },
    refundApprovalThresholdPaise: null,
  })),
}))
const { closeOpenLinks, sendRefunds } = vi.hoisted(() => ({
  closeOpenLinks: vi.fn(async () => ({ ok: true })),
  sendRefunds: vi.fn(async () => {}),
}))
vi.mock('@/lib/payments/wiring', () => ({ payments: () => ({ closeOpenLinks, sendRefunds }) }))

const scope = await import('@/lib/accounts/scope')
const bookings = await import('@/lib/accounts/bookings')
const documents = await import('@/lib/accounts/documents')
const { cancelBooking, rescheduleBooking } = await import('@/lib/booking/changes')
const { paidPaiseFor, loadRules } = await import('@/lib/booking/load')
const { refundableOnChain, requestClientRefund } = await import('@/lib/bookingFlow/clientRefund')
const { bookingsStoreHere } = await import('@/lib/bookingFlow/guards')
const { readPaymentSettings } = await import('@/lib/payments/records')
const { getFlags } = await import('@/lib/settings/read')
const { memoryStore, pdfKeyFor } = await import('@/lib/certificates/store')
const { sha256Hex } = await import('@/lib/certificates/token')
const { memoryInvoiceFiles, invoicePdfKey } = await import('@/lib/invoicing/store')
const { formatCertificateId } = await import('@/lib/certificates/ids')

/** Fake certificates of 2099, with the check digit the ID's format needs. */
const [CERT1, CERT2, CERT3] = [1, 2, 3].map((sequence) => formatCertificateId(2099, sequence)) as [
  string,
  string,
  string,
]

// ---- A fake database: Payload's find, findByID, findGlobal and create over rows in memory ----

type Row = Record<string, unknown> & { id: number }
type Where = Record<string, unknown>

function matches(row: Row, where: Where | undefined): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'and') return (condition as Where[]).every((part) => matches(row, part))
    if (key === 'or') return (condition as Where[]).some((part) => matches(row, part))
    const value = row[key]
    const test = condition as Record<string, unknown>
    if ('equals' in test) return value === test.equals
    if ('in' in test) return (test.in as unknown[]).includes(value)
    if ('not_in' in test) return !(test.not_in as unknown[]).includes(value)
    if ('not_equals' in test) return value !== test.not_equals
    throw new Error(`The fake database does not answer ${JSON.stringify(test)}.`)
  })
}

type Query = { collection: string; where?: Where; overrideAccess?: boolean; id?: number }

function fakeDatabase(rows: Record<string, Row[]>, flags: Record<string, boolean> = {}) {
  const queries: Query[] = []
  const created: { collection: string; data: Record<string, unknown> }[] = []
  const table = (collection: string) => rows[collection] ?? []
  const payload = {
    find: async (args: Query & { limit?: number }) => {
      queries.push(args)
      const docs = table(args.collection).filter((row) => matches(row, args.where))
      return { docs: args.limit ? docs.slice(0, args.limit) : docs }
    },
    findByID: async (args: Query) => {
      queries.push(args)
      return table(args.collection).find((row) => row.id === args.id) ?? null
    },
    findGlobal: async () => ({ flags }),
    create: async (args: { collection: string; data: Record<string, unknown> }) => {
      created.push(args)
      return { id: created.length, ...args.data }
    },
  }
  const req = { payload } as unknown as PayloadRequest
  return { req, queries, created }
}

const session = (accountId: number, personId: number): AccountSession => ({
  accountId,
  personId,
  authUserId: `fake-auth-user-${accountId}`,
  sessionId: `fake-session-${accountId}`,
  signedInAt: new Date('2099-08-01T04:00:00Z'),
  expiresAt: new Date('2099-08-31T04:00:00Z'),
  trustedDevice: false,
  verified: { email: `client${accountId}@example.invalid`, mobile: null },
})

/** Two accounts: the first holds its own record (1) and an earlier one (2); the second holds 3. */
const FIRST = session(10, 1)
const SECOND = session(20, 3)
const NOW = new Date('2099-08-03T02:30:00Z') // 8 AM in India

const booking = (id: number, person: number, extra: Partial<Row> = {}): Row => ({
  id,
  reference: `IIIC-S-${String(90000 + id)}`,
  type: 'session',
  status: 'confirmed',
  service: 100,
  serviceOption: 'fake-option',
  optionLabel: 'Fake 30',
  durationMinutes: 30,
  practitioner: 200,
  event: null,
  format: 'online',
  startsAt: '2099-08-03T04:30:00Z',
  endsAt: '2099-08-03T05:00:00Z',
  meetingUrl: 'https://meet.example.invalid/fake-link',
  rescheduledFrom: null,
  person,
  ...extra,
})

function world(flags: Record<string, boolean> = {}) {
  return fakeDatabase(
    {
      accounts: [
        { id: 10, person: 1 },
        { id: 20, person: 3 },
      ],
      people: [
        { id: 1, fullName: 'Fake Client One', account: 10 },
        { id: 2, fullName: 'Fake Client One (earlier)', account: 10 },
        { id: 3, fullName: 'Fake Client Two', account: 20 },
        { id: 4, fullName: 'Fake Stranger', account: null },
      ],
      bookings: [
        booking(1, 1),
        booking(2, 2, {
          type: 'call',
          service: 101,
          status: 'completed',
          startsAt: '2099-07-01T04:30:00Z',
          endsAt: '2099-07-01T05:00:00Z',
        }),
        booking(3, 3),
        booking(4, 4),
        booking(5, 1, { status: 'rescheduled' }),
      ],
      services: [
        { id: 100, name: 'Fake session', register: 'counselling', type: 'session' },
        { id: 101, name: 'Fake proposal call', register: 'consultancy', type: 'call' },
      ],
      practitioners: [{ id: 200, publicName: 'Fake Counsellor' }],
      certificates: [
        {
          id: 300,
          person: 2,
          certificateId: CERT1,
          programmeName: 'Fake programme',
          completedOn: '2099-07-15',
          status: 'valid',
          pdfKey: pdfKeyFor(CERT1),
          pdfSha256: null,
        },
        {
          id: 301,
          person: 1,
          certificateId: CERT2,
          programmeName: 'Fake programme',
          completedOn: '2099-07-16',
          status: 'revoked',
          pdfKey: pdfKeyFor(CERT2),
          pdfSha256: null,
        },
        {
          id: 302,
          person: 3,
          certificateId: CERT3,
          programmeName: 'Fake programme',
          completedOn: '2099-07-17',
          status: 'valid',
          pdfKey: pdfKeyFor(CERT3),
          pdfSha256: null,
        },
      ],
      invoices: [
        {
          id: 400,
          booking: 1,
          number: 'FAKE-INV-1',
          kind: 'taxInvoice',
          status: 'issued',
          issuedAt: '2099-08-01T06:00:00Z',
          totals: { totalPaise: 150_000 },
          pdfKey: 'invoices/400.pdf',
        },
        {
          id: 401,
          booking: 3,
          number: 'FAKE-INV-2',
          kind: 'taxInvoice',
          status: 'issued',
          issuedAt: '2099-08-01T06:00:00Z',
          totals: { totalPaise: 150_000 },
          pdfKey: 'invoices/401.pdf',
        },
        {
          id: 402,
          booking: 1,
          number: null,
          kind: 'receiptVoucher',
          status: 'pending',
          issuedAt: null,
          totals: { totalPaise: 150_000 },
          pdfKey: null,
        },
      ],
    },
    flags,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(bookingsStoreHere).mockReturnValue(true)
  vi.mocked(paidPaiseFor).mockResolvedValue(0)
})

// ---- Every query in src/lib/accounts is scoped (docs/20 §8; D-127) ----

const ACCOUNTS_DIR = path.join(process.cwd(), 'src', 'lib', 'accounts')
const APP_DIR = path.join(process.cwd(), 'src', 'app', '(platform)', '(account)')

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name)
    return statSync(file).isDirectory() ? filesUnder(file) : /\.tsx?$/.test(name) ? [file] : []
  })
}

describe('every query in src/lib/accounts', () => {
  it('says what keeps it to the account wherever it reads past the access rules', () => {
    const unscoped: string[] = []
    for (const file of filesUnder(ACCOUNTS_DIR)) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, index) => {
        if (!/overrideAccess:\s*true/.test(line) || /^\s*(\*|\/\/)/.test(line)) return
        const before = lines.slice(Math.max(0, index - 14), index).join('\n')
        if (!/\/\/ scope: \S/.test(before)) {
          unscoped.push(`${path.relative(process.cwd(), file)}:${index + 1}`)
        }
      })
    }
    // A query here without a `// scope:` line (what keeps it to the signed-in account's records)
    // is refused. Read a person's records through src/lib/accounts/scope.ts's readers instead.
    expect(unscoped).toEqual([])
  })

  it('reads bookings, certificates and invoices in slice B only through the scoped readers', () => {
    for (const name of ['bookings.ts', 'documents.ts']) {
      const source = readFileSync(path.join(ACCOUNTS_DIR, name), 'utf8')
      expect(source, name).not.toMatch(/collection:\s*'(bookings|certificates|invoices|people)'/)
    }
  })

  it('is never made from My IIIC’s pages, routes or actions themselves', () => {
    for (const file of filesUnder(APP_DIR).filter((file) => !file.includes(`${path.sep}privacy`))) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/overrideAccess|req\.payload\.|getPayload\(/)
    }
  })

  it('comes after the flag and the session on every page, route and action', () => {
    // Every page but the one closing leads to, which no session can open (see "the door" below).
    const closed = path.join('privacy', 'closed', 'page.tsx')
    for (const file of filesUnder(APP_DIR).filter(
      (file) => /(page|route)\.tsx?$/.test(file) && !file.endsWith(closed),
    )) {
      // The page's own function, or the route's GET: what runs first on a request.
      const whole = readFileSync(file, 'utf8')
      const source = whole.slice(whole.search(/export (default )?async function/))
      const door = source.search(/await openMyIiic(Route)?\(/)
      expect(door, file).toBeGreaterThan(-1)
      for (const read of [/await params/, /await searchParams/, /accountRequest\(\)/]) {
        const at = source.search(read)
        if (at > -1) expect(at, `${file}: ${read}`).toBeGreaterThan(door)
      }
    }
    const actions = readFileSync(path.join(APP_DIR, 'account', 'actions.ts'), 'utf8')
    for (const name of ['rescheduleOwnAction', 'cancelOwnAction']) {
      const body = actions.slice(actions.indexOf(`export async function ${name}`))
      expect(body.search(/await openMyIiic\(/), name).toBeGreaterThan(-1)
      expect(body.search(/await openMyIiic\(/), name).toBeLessThan(body.search(/text\(form/))
    }
  })
})

describe('the account’s own records', () => {
  it('are its own record and those attached to it, and nothing while the account is gone', async () => {
    const { req } = world()
    expect(await scope.ownPersonIds(req, FIRST)).toEqual([1, 2])
    expect(await scope.ownPersonIds(req, SECOND)).toEqual([3])
    expect(await scope.ownPersonIds(req, session(99, 1))).toEqual([])
  })

  it('are read with "the record is one of the account’s" in every query, and none without records', async () => {
    const { req, queries } = world()
    await scope.findOwnBookings(req, [1, 2], { select: { reference: true } })
    expect(queries.at(-1)?.where).toEqual({ person: { in: [1, 2] } })
    await scope.findOwnCertificates(req, [3], {
      select: { certificateId: true },
      where: { id: { equals: 302 } },
    })
    expect(queries.at(-1)?.where).toEqual({
      and: [{ person: { in: [3] } }, { id: { equals: 302 } }],
    })
    const before = queries.length
    expect(await scope.findOwnBookings(req, [], { select: { reference: true } })).toEqual([])
    expect(await scope.findOwnInvoices(req, [], { select: { number: true } })).toEqual([])
    expect(queries.length).toBe(before)
  })

  it('give the first name on the account’s own record', async () => {
    const { req } = world()
    expect(await scope.ownFirstName(req, FIRST)).toBe('Fake')
    expect(await scope.ownFirstName(req, session(99, 1))).toBeNull()
  })

  it('name the account, never an address, as the audit log’s actor', () => {
    expect(scope.accountActor(FIRST)).toEqual({ id: 'account:10' })
  })
})

describe('bookings', () => {
  it('lists the account’s upcoming and past bookings, and no one else’s', async () => {
    const { req } = world()
    const upcoming = await bookings.listOwnBookings(req, FIRST, 'upcoming', NOW)
    const past = await bookings.listOwnBookings(req, FIRST, 'past', NOW)
    expect(upcoming.map((each) => each.reference)).toEqual(['IIIC-S-90001'])
    // The earlier record's booking is listed; a moved booking is not (the booking it became is).
    expect(past.map((each) => each.reference)).toEqual(['IIIC-S-90002'])
    const second = await bookings.listOwnBookings(req, SECOND, 'upcoming', NOW)
    expect(second.map((each) => each.reference)).toEqual(['IIIC-S-90003'])
  })

  it('shows a booking as its confirmation does, with nothing of the price or the person', async () => {
    const { req } = world()
    const own = await bookings.getOwnBooking(req, FIRST, 'IIIC-S-90001', NOW)
    expect(own).toMatchObject({
      reference: 'IIIC-S-90001',
      serviceName: 'Fake session',
      register: 'counselling',
      format: 'online',
      place: 'https://meet.example.invalid/fake-link',
      practitionerName: 'Fake Counsellor',
      canReschedule: true,
      canCancel: true,
    })
    expect(Object.keys(own ?? {}).sort()).toEqual(
      [
        'canCancel',
        'canReschedule',
        'endsAt',
        'format',
        'id',
        'place',
        'practitionerName',
        'reference',
        'register',
        'serviceName',
        'startsAt',
        'status',
      ].sort(),
    )
    expect(bookings.isCounselling(own!)).toBe(true)
  })

  it('answers another account’s booking exactly as one that does not exist', async () => {
    const { req } = world()
    expect(await bookings.getOwnBooking(req, SECOND, 'IIIC-S-90001', NOW)).toBeNull()
    expect(await bookings.getOwnBooking(req, FIRST, 'IIIC-S-90004', NOW)).toBeNull()
    expect(await bookings.getOwnBooking(req, FIRST, 'IIIC-S-99999', NOW)).toBeNull()
    expect(await bookings.getOwnBooking(req, FIRST, "' OR 1=1 --", NOW)).toBeNull()
    expect(await bookings.ownBookingPage(req, SECOND, 'IIIC-S-90001', NOW)).toBeNull()
    expect(await bookings.ownBookingInvite(req, SECOND, 'IIIC-S-90001', 'https://x.invalid')).toBe(
      null,
    )
    const times = await bookings.ownFreeTimes(req, SECOND, 'IIIC-S-90001', NOW)
    expect(times).toEqual({ ok: false, error: { code: 'not-found' } })
  })

  it('refuses to move or cancel another account’s booking, touching nothing', async () => {
    const { req } = world()
    for (const input of [
      { kind: 'cancel', reference: 'IIIC-S-90001' },
      { kind: 'reschedule', reference: 'IIIC-S-90001', startsAt: '2099-08-03T05:30:00Z' },
    ] as const) {
      expect(await bookings.manageOwnBooking(req, SECOND, input, NOW)).toEqual({
        ok: false,
        error: { code: 'not-found' },
      })
    }
    expect(cancelBooking).not.toHaveBeenCalled()
    expect(rescheduleBooking).not.toHaveBeenCalled()
  })

  it('acts on nothing on a preview, before reading anything', async () => {
    vi.mocked(bookingsStoreHere).mockReturnValue(false)
    const { req, queries } = world()
    const answer = await bookings.manageOwnBooking(
      req,
      FIRST,
      { kind: 'cancel', reference: 'IIIC-S-90001' },
      NOW,
    )
    expect(answer).toEqual({ ok: false, error: { code: 'closed-here' } })
    expect(queries).toEqual([])
  })

  it('cancels the account’s own booking through M3 as the client, under the same policy', async () => {
    const { req } = world()
    vi.mocked(cancelBooking).mockImplementation(async (_req, input) => ({
      ok: true,
      value: {
        booking: { id: input.bookingId, status: 'cancelledByClient' } as never,
        refundPaise: 0,
      },
    }))
    const answer = await bookings.changeOwnBooking(
      req,
      FIRST,
      { kind: 'cancel', reference: 'IIIC-S-90001', reason: 'Fake reason' },
      NOW,
    )
    expect(cancelBooking).toHaveBeenCalledWith(req, {
      bookingId: 1,
      by: 'client',
      reason: 'Fake reason',
      asker: 'client',
      now: NOW,
    })
    expect(closeOpenLinks).toHaveBeenCalledWith(req, 1)
    expect(requestClientRefund).toHaveBeenCalled()
    expect(sendRefunds).toHaveBeenCalledWith(req.payload, [])
    expect(answer.ok && answer.value.cancelled).toEqual({ refunded: false, awaitsOwner: false })
  })

  it('keeps M3’s refusals: outside the window or the rule is outside policy, a taken time is taken', async () => {
    const { req } = world()
    vi.mocked(cancelBooking).mockResolvedValue({
      ok: false,
      error: { code: 'not-allowed', reason: 'started' },
    })
    expect(
      await bookings.manageOwnBooking(
        req,
        FIRST,
        { kind: 'cancel', reference: 'IIIC-S-90001' },
        NOW,
      ),
    ).toEqual({ ok: false, error: { code: 'outside-policy' } })
    vi.mocked(rescheduleBooking).mockResolvedValue({ ok: false, error: { code: 'slot-taken' } })
    expect(
      await bookings.manageOwnBooking(
        req,
        FIRST,
        { kind: 'reschedule', reference: 'IIIC-S-90001', startsAt: '2099-08-03T05:30:00Z' },
        NOW,
      ),
    ).toEqual({ ok: false, error: { code: 'slot-taken' } })
    expect(rescheduleBooking).toHaveBeenCalledWith(req, {
      bookingId: 1,
      startsAt: new Date('2099-08-03T05:30:00Z'),
      by: 'client',
      now: NOW,
    })
    expect(
      await bookings.manageOwnBooking(
        req,
        FIRST,
        { kind: 'reschedule', reference: 'IIIC-S-90001', startsAt: 'tomorrow' },
        NOW,
      ),
    ).toEqual({ ok: false, error: { code: 'invalid-input' } })
  })

  it('does not cancel when the payments cannot give back the refund the rule promised', async () => {
    const { req } = world()
    vi.mocked(cancelBooking).mockResolvedValue({
      ok: true,
      value: { booking: { id: 1 } as never, refundPaise: 50_000 },
    })
    vi.mocked(requestClientRefund).mockResolvedValueOnce({
      refundIds: [],
      toSend: [],
      awaitingOwner: false,
      requestedPaise: 20_000,
    })
    expect(
      await bookings.manageOwnBooking(
        req,
        FIRST,
        { kind: 'cancel', reference: 'IIIC-S-90001' },
        NOW,
      ),
    ).toEqual({ ok: false, error: { code: 'outside-policy' } })
    expect(sendRefunds).not.toHaveBeenCalled()
  })

  it('says a refund without its amount while prices are hidden, and offers no cancel it cannot keep', async () => {
    const { req } = world()
    vi.mocked(paidPaiseFor).mockResolvedValue(150_000)
    vi.mocked(refundableOnChain).mockResolvedValue(150_000)
    const page = await bookings.ownBookingPage(req, FIRST, 'IIIC-S-90001', NOW)
    expect(page?.refund).toEqual({ kind: 'some', awaitsOwner: true })
    expect(JSON.stringify(page)).not.toContain('150000')
    vi.mocked(readPaymentSettings).mockResolvedValueOnce({
      flags: { pricesPublic: true } as never,
      refundApprovalThresholdPaise: 1_000_000,
    })
    const priced = await bookings.ownBookingPage(req, FIRST, 'IIIC-S-90001', NOW)
    expect(priced?.refund).toEqual({ kind: 'amount', paise: 150_000, awaitsOwner: false })
    vi.mocked(refundableOnChain).mockResolvedValue(10_000)
    const held = await bookings.getOwnBooking(req, FIRST, 'IIIC-S-90001', NOW)
    expect(held?.canCancel).toBe(false)
    expect(loadRules).toHaveBeenCalled()
  })
})

describe('documents', () => {
  it('lists the account’s certificates, a revoked one with no download, and no one else’s', async () => {
    const { req } = world()
    const own = await documents.listOwnCertificates(req, FIRST)
    expect(own.map((each) => [each.certificateId, each.status, each.downloadable])).toEqual([
      [CERT1, 'valid', true],
      [CERT2, 'revoked', false],
    ])
    expect((await documents.listOwnCertificates(req, SECOND)).map((each) => each.id)).toEqual([302])
  })

  it('lists invoices with no amount and no PDF while prices are hidden (D-21, D-118)', async () => {
    const { req } = world({ pricesPublic: false })
    const own = await documents.listOwnInvoices(req, FIRST)
    expect(own.map((each) => each.id)).toEqual([400])
    expect(own[0]).toMatchObject({ totalPaise: null, downloadable: false, number: 'FAKE-INV-1' })
    const { req: priced } = world({ pricesPublic: true })
    expect((await documents.listOwnInvoices(priced, FIRST))[0]).toMatchObject({
      totalPaise: 150_000,
      downloadable: true,
    })
    expect((await documents.listOwnInvoices(priced, SECOND)).map((each) => each.id)).toEqual([401])
  })

  function stores() {
    const certificates = memoryStore()
    const invoices = memoryInvoiceFiles()
    return {
      certificates,
      invoices,
      download: documents.downloadOwnDocumentWith({
        certificates: () => ({ ok: true, value: certificates }),
        invoices: () => invoices,
      }),
    }
  }

  it('hands back a valid certificate only after writing the audit entry in the account’s name', async () => {
    const { req, created } = world()
    const { certificates, download } = stores()
    const pdf = new Uint8Array([37, 80, 68, 70])
    await certificates.put(pdfKeyFor(CERT1), pdf)
    const answer = await download(req, FIRST, { kind: 'certificate', id: 300 })
    expect(answer.ok && answer.value.filename).toBe(`${CERT1}.pdf`)
    expect(created).toEqual([
      expect.objectContaining({
        collection: 'audit-log',
        data: expect.objectContaining({
          action: 'download-certificate',
          entity: 'certificates',
          entityId: '300',
          actorId: 'account:10',
        }),
      }),
    ])
    // A download the log could not record does not happen.
    const failing = world()
    failing.req.payload.create = (async () => {
      throw new Error('the audit log is down')
    }) as never
    await expect(download(failing.req, FIRST, { kind: 'certificate', id: 300 })).rejects.toThrow()
  })

  it('checks the certificate’s file against the SHA-256 kept at issue', async () => {
    const { certificates, download } = stores()
    await certificates.put(pdfKeyFor(CERT1), new Uint8Array([1, 2, 3]))
    const tampered = fakeDatabase({
      accounts: [{ id: 10, person: 1 }],
      people: [{ id: 1, account: 10 }],
      certificates: [
        {
          id: 300,
          person: 1,
          certificateId: CERT1,
          status: 'valid',
          pdfKey: pdfKeyFor(CERT1),
          pdfSha256: sha256Hex(new Uint8Array([9, 9, 9])),
        },
      ],
    })
    expect(await download(tampered.req, FIRST, { kind: 'certificate', id: 300 })).toEqual({
      ok: false,
      error: { code: 'not-available' },
    })
    expect(tampered.created).toEqual([])
  })

  it('answers another account’s certificate or invoice as one that does not exist, reading no file', async () => {
    const { req, created } = world({ pricesPublic: true })
    const { certificates, invoices, download } = stores()
    const read = vi.spyOn(certificates, 'get')
    const readInvoice = vi.spyOn(invoices, 'get')
    expect(await download(req, FIRST, { kind: 'certificate', id: 302 })).toEqual({
      ok: false,
      error: { code: 'not-found' },
    })
    expect(await download(req, FIRST, { kind: 'invoice', id: 401 })).toEqual({
      ok: false,
      error: { code: 'not-found' },
    })
    expect(await download(req, FIRST, { kind: 'invoice', id: -1 })).toEqual({
      ok: false,
      error: { code: 'not-found' },
    })
    expect(read).not.toHaveBeenCalled()
    expect(readInvoice).not.toHaveBeenCalled()
    expect(created).toEqual([])
  })

  it('has no download for a revoked certificate', async () => {
    const { req } = world()
    const { download } = stores()
    expect(await download(req, FIRST, { kind: 'certificate', id: 301 })).toEqual({
      ok: false,
      error: { code: 'not-available' },
    })
  })

  it('gives no invoice PDF while prices are hidden, and one audited once they are public', async () => {
    const hidden = world({ pricesPublic: false })
    const { invoices, download } = stores()
    await invoices.put(invoicePdfKey(400), new Uint8Array([37, 80, 68, 70]))
    expect(await download(hidden.req, FIRST, { kind: 'invoice', id: 400 })).toEqual({
      ok: false,
      error: { code: 'prices-hidden' },
    })
    expect(hidden.created).toEqual([])
    const shown = world({ pricesPublic: true })
    const answer = await download(shown.req, FIRST, { kind: 'invoice', id: 400 })
    expect(answer.ok && answer.value.filename).toBe('FAKE-INV-1.pdf')
    expect(shown.created[0]?.data).toMatchObject({
      action: 'download-invoice',
      entityId: '400',
      actorId: 'account:10',
    })
  })

  it('answers a download as a private attachment, and every refusal as "not here"', async () => {
    const sent = documents.documentResponse({
      ok: true,
      value: { pdf: new Uint8Array([1]), filename: 'IIIC-C-2099-0001-0.pdf' },
    })
    expect(sent.headers.get('cache-control')).toBe('private, no-store')
    expect(sent.headers.get('content-disposition')).toBe(
      'attachment; filename="IIIC-C-2099-0001-0.pdf"',
    )
    for (const code of ['not-found', 'not-available', 'prices-hidden'] as const) {
      expect(documents.documentResponse({ ok: false, error: { code } }).status).toBe(404)
    }
    expect(
      documents.documentResponse({ ok: false, error: { code: 'storage-missing' } }).status,
    ).toBe(503)
    expect(documents.documentId('300')).toBe(300)
    expect(documents.documentId('3e2')).toBe(0)
  })
})

describe('the door', () => {
  const door = () => vi.importActual<typeof import('@/lib/accounts/scope')>('@/lib/accounts/scope')

  it('is the 404 while accounts are switched off, before any session is read', async () => {
    const actual = await door()
    storedFlags.accountsEnabled = false
    // The site's cache still says on: the door reads the settings themselves, not the cache.
    vi.mocked(getFlags).mockResolvedValue({ accountsEnabled: true } as never)
    await expect(actual.openMyIiic('/account')).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/)
    const answer = await actual.openMyIiicRoute('/account/documents')
    expect(answer instanceof Response && answer.status).toBe(404)
    expect(answer instanceof Response && answer.headers.get('cache-control')).toBe(
      'private, no-store',
    )
    expect(await actual.accountsOn()).toBe(false)
    expect(getFlags).not.toHaveBeenCalled()
  })

  it('sends a person with no session to sign in, with the page to come back to', async () => {
    const actual = await door()
    storedFlags.accountsEnabled = true
    // The site's cache still says off, as it would after a switch it never heard of.
    vi.mocked(getFlags).mockResolvedValue({ accountsEnabled: false } as never)
    await expect(actual.openMyIiic('/account/bookings')).rejects.toThrow(/NEXT_REDIRECT/)
    await expect(actual.requireAccount({ next: 'https://elsewhere.invalid' })).rejects.toThrow(
      /NEXT_REDIRECT/,
    )
    const answer = await actual.openMyIiicRoute('/account/invoices')
    expect(answer instanceof Response && answer.status).toBe(303)
    expect(answer instanceof Response && answer.headers.get('location')).toBe(
      '/login?next=%2Faccount%2Finvoices',
    )
    expect(answer instanceof Response && answer.headers.get('cache-control')).toBe(
      'private, no-store',
    )
    expect(getFlags).not.toHaveBeenCalled()
  })

  it('stands before the page closing leads to: the 404 while switched off, signed out only', async () => {
    const { default: ClosedPage } =
      await import('@/app/(platform)/(account)/account/privacy/closed/page')
    const { CLOSED_COPY } = await import('@/lib/accounts/privacy/copy')
    const seams = await import('@/lib/accounts/privacy/seams')
    storedFlags.accountsEnabled = false
    vi.mocked(getFlags).mockResolvedValue({ accountsEnabled: true } as never)
    await expect(ClosedPage()).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/)
    expect(seams.getAccountSession).not.toHaveBeenCalled()
    storedFlags.accountsEnabled = true
    expect(renderToStaticMarkup(await ClosedPage())).toContain(CLOSED_COPY.heading)
    vi.mocked(seams.getAccountSession).mockResolvedValueOnce(FIRST)
    await expect(ClosedPage()).rejects.toThrow(/NEXT_REDIRECT/)
  })

  it('and the frame never read the site’s cached flags', () => {
    for (const file of [...filesUnder(ACCOUNTS_DIR), ...filesUnder(APP_DIR)]) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/getFlags|@\/lib\/settings\/read/)
    }
    // The frame draws "Sign out" from the session alone, which is null while the flag is off.
    const layout = readFileSync(path.join(APP_DIR, 'layout.tsx'), 'utf8')
    expect(layout).toMatch(/await getAccountSession\(\)/)
  })
})

// ---- The pages, drawn as the server draws them, over the same fake database ----

const { renderToStaticMarkup } = await import('react-dom/server')
const { CRISIS_HEADING, SCOPE_HEADING } = await import('@/lib/counselling/scope')
const { INVOICES_COPY } = await import('@/components/account/copy')
const { listSlots } = await import('@/lib/booking/api')

/** The page as HTML, signed in as `account` over `db`. */
async function draw(
  page: (props: never) => Promise<ReactElement>,
  props: Record<string, unknown>,
  db: ReturnType<typeof world>,
  account: AccountSession = FIRST,
): Promise<string> {
  vi.mocked(scope.openMyIiic).mockResolvedValue(account)
  vi.mocked(scope.accountRequest).mockResolvedValue(db.req)
  return renderToStaticMarkup(await page(props as never))
}

const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1])

/** Where a My IIIC page may link: itself, the booking's link, IIIC's phone and email. */
const MAY_LINK = /^(\/account(\/|$)|tel:|mailto:|https:\/\/meet\.example\.invalid\/)/

describe('a counselling booking in My IIIC', () => {
  it('ends with the scope statement and the crisis numbers, and offers nothing beside it', async () => {
    const { default: BookingPage } =
      await import('@/app/(platform)/(account)/account/bookings/[ref]/page')
    const html = await draw(
      BookingPage,
      { params: Promise.resolve({ ref: 'IIIC-S-90001' }), searchParams: Promise.resolve({}) },
      world(),
    )
    expect(html).toContain(SCOPE_HEADING)
    expect(html).toContain(CRISIS_HEADING)
    expect(html).toContain('IIIC-S-90001')
    expect(hrefs(html).filter((href) => !MAY_LINK.test(href ?? ''))).toEqual([])
    // "Not your booking?" opens the privacy page's request form as a correction naming it.
    expect(hrefs(html)).toContain(
      '/account/privacy?request=correction&amp;booking=IIIC-S-90001#requests',
    )
    expect(html).not.toContain('₹')
  })

  it('is the overview’s next booking with the same statement and no recommendation', async () => {
    const { default: OverviewPage } = await import('@/app/(platform)/(account)/account/page')
    const html = await draw(OverviewPage, {}, world())
    expect(html).toContain('Hello, Fake')
    expect(html).toContain(CRISIS_HEADING)
    expect(hrefs(html).filter((href) => !MAY_LINK.test(href ?? ''))).toEqual([])
  })

  it('moves only to the free times M3 offers, in a form that works without JavaScript', async () => {
    const { default: BookingPage } =
      await import('@/app/(platform)/(account)/account/bookings/[ref]/page')
    vi.mocked(listSlots).mockResolvedValue({
      ok: true,
      value: { days: [{ day: '2099-08-03', starts: ['2099-08-03T05:30:00.000Z'] }] },
    })
    const html = await draw(
      BookingPage,
      {
        params: Promise.resolve({ ref: 'IIIC-S-90001' }),
        searchParams: Promise.resolve({ step: 'reschedule' }),
      },
      world(),
    )
    expect(html).toMatch(/<form[^>]*action=/)
    expect(html).toContain('value="2099-08-03T05:30:00.000Z"')
    expect(listSlots).toHaveBeenCalledWith(
      expect.anything(),
      { serviceId: 100, serviceOption: 'fake-option', practitionerId: 200 },
      expect.any(Date),
    )
  })

  it('is the 404 for anyone else, as a booking that does not exist', async () => {
    const { default: BookingPage } =
      await import('@/app/(platform)/(account)/account/bookings/[ref]/page')
    await expect(
      draw(
        BookingPage,
        { params: Promise.resolve({ ref: 'IIIC-S-90001' }), searchParams: Promise.resolve({}) },
        world(),
        SECOND,
      ),
    ).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/)
  })
})

describe('the documents and invoices pages', () => {
  it('print no amount and offer no invoice PDF while prices are hidden', async () => {
    const { default: InvoicesPage } =
      await import('@/app/(platform)/(account)/account/invoices/page')
    const html = await draw(InvoicesPage, {}, world({ pricesPublic: false }))
    expect(html).toContain('FAKE-INV-1')
    expect(html).not.toContain('FAKE-INV-2')
    expect(html).not.toContain('₹')
    expect(html).not.toContain('1,500')
    expect(html).not.toContain('/pdf')
    expect(html).toContain(INVOICES_COPY.pdfByReply)
    const priced = await draw(InvoicesPage, {}, world({ pricesPublic: true }))
    expect(priced).toContain('₹1,500.00')
    expect(priced).toContain('/account/invoices/400/pdf')
  })

  it('offer a valid certificate’s PDF and none for a revoked one', async () => {
    const { default: DocumentsPage } =
      await import('@/app/(platform)/(account)/account/documents/page')
    const html = await draw(DocumentsPage, {}, world())
    expect(html).toContain('/account/documents/certificates/300/pdf')
    expect(html).not.toContain('/account/documents/certificates/301/pdf')
    expect(html).not.toContain(CERT3)
    expect(html).toContain(`/institute/verify?id=${CERT1}`)
  })
})

describe('candidate copy (I-41)', () => {
  it('is marked on each of My IIIC’s pages, as on the sign-in pages and the privacy page', async () => {
    const pages = [
      ['@/app/(platform)/(account)/account/page', {}],
      ['@/app/(platform)/(account)/account/bookings/page', {}],
      [
        '@/app/(platform)/(account)/account/bookings/[ref]/page',
        { params: Promise.resolve({ ref: 'IIIC-S-90001' }), searchParams: Promise.resolve({}) },
      ],
      ['@/app/(platform)/(account)/account/documents/page', {}],
      ['@/app/(platform)/(account)/account/invoices/page', {}],
    ] as const
    for (const [module, props] of pages) {
      const { default: Page } = (await import(module)) as {
        default: (props: never) => Promise<ReactElement>
      }
      const html = await draw(Page, props, world())
      expect(html, module).toContain('data-candidate="I-41"')
      expect(html, module).toContain('Candidate copy, awaiting IIIC’s approval (I-41)')
    }
  })
})

describe('signing out (docs/20 §4.7)', () => {
  it('is the frame’s one "Sign out": it ends this session, then goes home', async () => {
    const { signOutAction } = await import('@/app/(platform)/(account)/account/actions')
    const thrown = await signOutAction().then(
      () => null,
      (error: unknown) => error as { digest?: string },
    )
    expect(thrown?.digest).toMatch(/^NEXT_REDIRECT;\w+;\/;/)
    // No second button or action of its own anywhere (slice A's went at the join).
    const src = path.join(process.cwd(), 'src')
    const said = filesUnder(src)
      .filter((file) => readFileSync(file, 'utf8').includes("'Sign out'"))
      .map((file) => path.relative(process.cwd(), file).split(path.sep).join('/'))
    expect(said).toEqual(['src/components/account/copy.ts'])
  })
})

describe('the beacon', () => {
  it('never counts the sign-in pages or My IIIC (docs/20 §8)', () => {
    for (const path of [
      '/login',
      '/login/verify',
      '/account',
      '/account/bookings',
      '/account/bookings/IIIC-S-90001',
      '/account/documents/certificates/300/pdf',
      '/ACCOUNT/privacy',
    ]) {
      expect(countsPath(path), path).toBe(false)
    }
    expect(countsPath('/accountancy')).toBe(true)
    expect(countsPath('/logins')).toBe(true)
  })
})

describe('the header', () => {
  it('shows "Log in" only while accounts are switched on, and reads no session', async () => {
    const { LogInLink, LOG_IN } = await import('@/components/site/SiteHeader')
    vi.mocked(getFlags).mockResolvedValue({ accountsEnabled: false } as never)
    expect(await LogInLink()).toBeNull()
    vi.mocked(getFlags).mockResolvedValue({ accountsEnabled: true } as never)
    const link = await LogInLink()
    expect(link?.props.href).toBe(LOG_IN.href)
  })
})
