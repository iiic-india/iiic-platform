import { randomBytes } from 'node:crypto'

import { sql } from '@payloadcms/db-postgres'
import { createLocalReq, getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { AccountSession } from '@/lib/accounts/contract'
import type {
  Account,
  Booking,
  Certificate,
  Person,
  PlatformSettings,
  Practitioner,
  Service,
} from '@/payload-types'
import config from '@/payload.config'

import { removeQueuedJobs } from '../helpers/queuedJobs'

vi.mock('server-only', () => ({}))

const { ownPersonIds } = await import('@/lib/accounts/scope')
const { getOwnBooking, listOwnBookings, manageOwnBooking, changeOwnBooking } =
  await import('@/lib/accounts/bookings')
const { downloadOwnDocumentWith, listOwnCertificates, listOwnInvoices } =
  await import('@/lib/accounts/documents')
const { bookWithoutPayment } = await import('@/lib/booking/confirm')
const { atIst } = await import('@/lib/booking/slots')
const { formatCertificateId } = await import('@/lib/certificates/ids')
const { memoryStore, pdfKeyFor } = await import('@/lib/certificates/store')
const { sha256Hex } = await import('@/lib/certificates/token')
const { invoicePdfKey, memoryInvoiceFiles } = await import('@/lib/invoicing/store')

// My IIIC's records against the real Postgres (docs/20 §7.1 to §7.4, §8, §11; D-118, D-127):
// two accounts, the first holding its own record and an earlier one; every function answers a
// second account's booking, certificate and invoice as one that does not exist; reschedule and
// cancel keep M3's policy and refund rule; a revoked certificate has no PDF; no amount and no
// invoice PDF while prices are hidden; each download writes its audit entry in the account's
// name. Needs the r2a_accounts migration. Every person, rule, booking and document is obviously
// fake; the day is one no other test uses (2099-08-03); everything but the append-only audit
// entries is removed at the end, and the settings are put back.

let payload: Payload
const TAG = 'int.accountsRecords'
const DAY = '2099-08-03'
const NOW = atIst(DAY, '08:00')
const at = (clock: string) => atIst(DAY, clock)

let service: Service
let practitioner: Practitioner
const people: Record<'own' | 'earlier' | 'other', Person> = {} as never
const accounts: Record<'first' | 'second', Account> = {} as never
const made: Record<'first' | 'past' | 'others' | 'paid', Booking> = {} as never
const certificates: Record<'valid' | 'revoked' | 'others', Certificate> = {} as never
const invoiceIds: Record<'own' | 'others', number> = {} as never
let saved: Pick<PlatformSettings, 'flags' | 'money'>
let keys = 0

const fresh = () => createLocalReq({}, payload)
const checkoutKey = () => `fake-accounts-${Date.now()}-${++keys}`

const session = (account: Account, person: Person): AccountSession => ({
  accountId: account.id,
  personId: person.id,
  authUserId: `fake-auth-user-${account.id}`,
  sessionId: `fake-session-${account.id}`,
  signedInAt: NOW,
  expiresAt: new Date(NOW.getTime() + 86_400_000),
  trustedDevice: false,
  verified: { email: `${TAG}.${account.id}@example.invalid`, mobile: null },
})
const first = () => session(accounts.first, people.own)
const second = () => session(accounts.second, people.other)

async function removeTestData() {
  const { docs: persons } = await payload.find({
    collection: 'people',
    where: { fullName: { like: TAG } },
    pagination: false,
    depth: 0,
  })
  const personIds = persons.map((person) => person.id)
  const { docs: bookings } = personIds.length
    ? await payload.find({
        collection: 'bookings',
        where: { person: { in: personIds } },
        pagination: false,
        depth: 0,
      })
    : { docs: [] as Booking[] }
  const bookingIds = bookings.map((booking) => booking.id)
  const { docs: profiles } = await payload.find({
    collection: 'practitioners',
    where: { publicName: { like: TAG } },
    pagination: false,
    depth: 0,
  })
  await removeQueuedJobs(payload, {
    bookingIds,
    practitionerIds: profiles.map((profile) => profile.id),
  })
  if (bookingIds.length) {
    const { docs: refunds } = await payload.find({
      collection: 'refunds',
      where: { booking: { in: bookingIds } },
      pagination: false,
      depth: 0,
    })
    for (const refund of refunds) {
      await payload.db.drizzle.execute(
        sql`DELETE FROM "payload_jobs" WHERE "input"->>'refundId' = ${String(refund.id)}`,
      )
    }
    const { docs: payments } = await payload.find({
      collection: 'payments',
      where: { booking: { in: bookingIds } },
      pagination: false,
      depth: 0,
    })
    for (const payment of payments) {
      await payload.db.drizzle.execute(
        sql`DELETE FROM "payload_jobs" WHERE "input"->>'paymentId' = ${String(payment.id)}`,
      )
    }
    await payload.delete({ collection: 'refunds', where: { booking: { in: bookingIds } } })
    await payload.delete({ collection: 'invoices', where: { booking: { in: bookingIds } } })
    await payload.delete({ collection: 'payments', where: { booking: { in: bookingIds } } })
  }
  if (personIds.length) {
    await payload.delete({ collection: 'certificates', where: { person: { in: personIds } } })
    await payload.delete({ collection: 'bookings', where: { person: { in: personIds } } })
    await payload.delete({ collection: 'accounts', where: { person: { in: personIds } } })
  }
  await payload.delete({ collection: 'calendar-connections', where: { calendarId: { like: TAG } } })
  await payload.delete({
    collection: 'availability-rules',
    where: { 'practitioner.publicName': { like: TAG } },
  })
  await payload.delete({ collection: 'practitioners', where: { publicName: { like: TAG } } })
  await payload.delete({
    collection: 'services',
    where: { slug: { like: 'int-accounts-records' } },
  })
  await payload.delete({ collection: 'people', where: { fullName: { like: TAG } } })
}

async function confirmedAt(clock: string, person: Person): Promise<Booking> {
  const booked = await bookWithoutPayment(await fresh(), {
    checkoutKey: checkoutKey(),
    serviceId: service.id,
    serviceOption: service.options?.[0]?.id as string,
    practitionerId: practitioner.id,
    personId: person.id,
    startsAt: at(clock),
    now: NOW,
  })
  if (!booked.ok) throw new Error(`booking refused: ${booked.error.code}`)
  return booked.value
}

async function certificate(sequence: number, person: Person, status: 'valid' | 'revoked') {
  const certificateId = formatCertificateId(2098, 880_000 + sequence)
  return payload.create({
    collection: 'certificates',
    data: {
      certificateId,
      status,
      person: person.id,
      nameAsPrinted: `Fake Learner ${TAG}`,
      programmeName: 'Fake programme',
      completedOn: '2098-12-20',
      verifyTokenHash: randomBytes(32).toString('hex'),
      pdfKey: pdfKeyFor(certificateId),
      pdfSha256: sha256Hex(PDF),
    } as Certificate,
  })
}

async function invoice(booking: Booking, sequence: number): Promise<number> {
  const created = await payload.create({
    collection: 'invoices',
    data: {
      kind: 'taxInvoice',
      status: 'issued',
      number: `FAKE-ACC-${sequence}`,
      booking: booking.id,
      issuedAt: at('09:00').toISOString(),
      totals: { taxablePaise: 127_119, cgstPaise: 11_441, sgstPaise: 11_440, totalPaise: 150_000 },
      idempotencyKey: `fake-${TAG}-${Date.now()}-${sequence}`,
    },
  })
  await payload.update({
    collection: 'invoices',
    id: created.id,
    data: { pdfKey: invoicePdfKey(created.id) },
  })
  return created.id
}

async function setFlags(flags: { pricesPublic: boolean }) {
  await payload.updateGlobal({
    slug: 'settings',
    data: { flags: { ...(saved.flags ?? {}), payAtBooking: false, ...flags } },
  })
}

/** A tiny PDF's bytes, the same in the store as at "issue". */
const PDF = new Uint8Array([37, 80, 68, 70, 45, 102, 97, 107, 101])
const certificateFiles = memoryStore()
const invoiceFiles = memoryInvoiceFiles()
const download = downloadOwnDocumentWith({
  certificates: () => ({ ok: true, value: certificateFiles }),
  invoices: () => invoiceFiles,
})

async function auditOf(entity: string, id: number) {
  const { docs } = await payload.find({
    collection: 'audit-log',
    where: { and: [{ entity: { equals: entity } }, { entityId: { equals: String(id) } }] },
    sort: 'at',
    pagination: false,
    overrideAccess: true,
  })
  return docs.map(({ action, actorId }) => ({ action, actorId }))
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  saved = await payload.findGlobal({
    slug: 'settings',
    select: { flags: true, money: true },
    depth: 0,
  })
  await payload.updateGlobal({
    slug: 'settings',
    data: { money: { refundApprovalThresholdPaise: null } },
  })
  service = await payload.create({
    collection: 'services',
    data: {
      name: `Fake session ${TAG}`,
      type: 'session',
      slug: `int-accounts-records-${Date.now()}`,
      register: 'counselling',
      format: 'online',
      active: true,
      options: [{ label: 'Fake 30', duration: 30 }],
      // Fake rules: no notice, three days ahead, a one-hour reschedule window, and the whole
      // payment back up to an hour before.
      bookingRules: {
        noticeHours: 0,
        horizonDays: 3,
        bufferMinutes: 0,
        holdMinutes: 10,
        rescheduleWindowHours: 1,
        refunds: [{ hoursBefore: 1, refundPercent: 100 }],
      },
    } as Service,
  })
  practitioner = await payload.create({
    collection: 'practitioners',
    data: { publicName: `Fake ${TAG}`, active: true, services: [service.id] } as Practitioner,
  })
  await payload.create({
    collection: 'calendar-connections',
    data: {
      practitioner: practitioner.id,
      provider: 'google',
      calendarId: `${TAG}@example.invalid`,
      status: 'connected',
    },
  })
  for (const weekday of [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ] as const) {
    await payload.create({
      collection: 'availability-rules',
      data: {
        practitioner: practitioner.id,
        weekday,
        spans: [{ start: '10:00', end: '13:00' }],
        validFrom: '2099-01-01',
      },
    })
  }
  people.own = await payload.create({
    collection: 'people',
    data: { fullName: `Fake Client ${TAG}`, email: `${TAG}.one@example.invalid` } as Person,
  })
  people.earlier = await payload.create({
    collection: 'people',
    data: { fullName: `Fake Client earlier ${TAG}`, email: `${TAG}.one@example.invalid` } as Person,
  })
  people.other = await payload.create({
    collection: 'people',
    data: { fullName: `Fake Other ${TAG}`, email: `${TAG}.two@example.invalid` } as Person,
  })
  accounts.first = await payload.create({ collection: 'accounts', data: { person: people.own.id } })
  accounts.second = await payload.create({
    collection: 'accounts',
    data: { person: people.other.id },
  })
  for (const [person, account] of [
    [people.own, accounts.first],
    [people.earlier, accounts.first],
    [people.other, accounts.second],
  ] as const) {
    await payload.update({ collection: 'people', id: person.id, data: { account: account.id } })
  }

  made.first = await confirmedAt('10:00', people.own)
  made.others = await confirmedAt('11:00', people.other)
  made.paid = await confirmedAt('12:00', people.own)
  made.past = await payload.create({
    collection: 'bookings',
    data: {
      reference: `IIIC-S-${String(Date.now() % 100_000).padStart(5, '0')}`,
      type: 'session',
      status: 'completed',
      paymentStatus: 'unpaid',
      service: service.id,
      person: people.earlier.id,
      startsAt: atIst('2099-07-01', '10:00').toISOString(),
      endsAt: atIst('2099-07-01', '10:30').toISOString(),
    } as Booking,
  })
  await payload.create({
    collection: 'payments',
    data: {
      booking: made.paid.id,
      kind: 'checkout',
      gateway: 'razorpay',
      status: 'captured',
      amountPaise: 50_000,
      currency: 'INR',
      refundedPaise: 0,
      receipt: `booking:${made.paid.id}:checkout`,
      gatewayOrderId: `order_fakeaccounts${Date.now()}`,
      gatewayPaymentId: `pay_fakeaccounts${Date.now()}`,
    },
  })

  certificates.valid = await certificate(1, people.earlier, 'valid')
  certificates.revoked = await certificate(2, people.own, 'revoked')
  certificates.others = await certificate(3, people.other, 'valid')
  for (const doc of Object.values(certificates)) {
    await certificateFiles.put(doc.pdfKey as string, PDF)
  }
  invoiceIds.own = await invoice(made.first, 1)
  invoiceIds.others = await invoice(made.others, 2)
  for (const id of Object.values(invoiceIds)) await invoiceFiles.put(invoicePdfKey(id), PDF)
})

afterAll(async () => {
  await payload.updateGlobal({
    slug: 'settings',
    data: { flags: saved.flags ?? {}, money: saved.money ?? {} },
  })
  await removeTestData()
})

describe('the account’s records', () => {
  it('are its own record and the earlier one attached, and only those', async () => {
    const req = await fresh()
    expect(await ownPersonIds(req, first())).toEqual(
      [people.own.id, people.earlier.id].sort((a, b) => a - b),
    )
    expect(await ownPersonIds(req, second())).toEqual([people.other.id])
  })
})

describe('bookings (docs/20 §7.2)', () => {
  it('lists the account’s own bookings, its earlier record’s included, and no one else’s', async () => {
    const req = await fresh()
    const upcoming = await listOwnBookings(req, first(), 'upcoming', NOW)
    expect(upcoming.map((booking) => booking.reference)).toEqual([
      made.first.reference,
      made.paid.reference,
    ])
    const past = await listOwnBookings(req, first(), 'past', NOW)
    expect(past.map((booking) => booking.reference)).toEqual([made.past.reference])
    const theirs = await listOwnBookings(req, second(), 'upcoming', NOW)
    expect(theirs.map((booking) => booking.reference)).toEqual([made.others.reference])
    // As the confirmation shows it, with no price.
    expect(JSON.stringify(upcoming)).not.toMatch(/50000|Paise|price/i)
    expect(upcoming[0]).toMatchObject({ register: 'counselling', practitionerName: `Fake ${TAG}` })
  })

  it('answers another account’s booking as one that does not exist', async () => {
    const req = await fresh()
    expect(await getOwnBooking(req, second(), made.first.reference, NOW)).toBeNull()
    expect(await getOwnBooking(req, first(), made.others.reference, NOW)).toBeNull()
    expect(
      await manageOwnBooking(
        req,
        second(),
        { kind: 'cancel', reference: made.first.reference },
        NOW,
      ),
    ).toEqual({ ok: false, error: { code: 'not-found' } })
    const unchanged = await payload.findByID({ collection: 'bookings', id: made.first.id })
    expect(unchanged.status).toBe('confirmed')
  })

  it('moves a booking within the window to a time the engine offers, and not outside it', async () => {
    const moved = await manageOwnBooking(
      await fresh(),
      first(),
      { kind: 'reschedule', reference: made.first.reference, startsAt: at('10:30').toISOString() },
      NOW,
    )
    if (!moved.ok) throw new Error(`reschedule refused: ${moved.error.code}`)
    expect(moved.value.startsAt?.toISOString()).toBe(at('10:30').toISOString())
    expect((await payload.findByID({ collection: 'bookings', id: made.first.id })).status).toBe(
      'rescheduled',
    )
    // Fifteen minutes before the window closes on the new time: outside it (D-16).
    expect(
      await manageOwnBooking(
        await fresh(),
        first(),
        {
          kind: 'reschedule',
          reference: moved.value.reference,
          startsAt: at('11:30').toISOString(),
        },
        at('09:45'),
      ),
    ).toEqual({ ok: false, error: { code: 'outside-policy' } })
    // A time another booking holds is taken.
    expect(
      await manageOwnBooking(
        await fresh(),
        first(),
        {
          kind: 'reschedule',
          reference: moved.value.reference,
          startsAt: at('11:00').toISOString(),
        },
        NOW,
      ),
    ).toMatchObject({ ok: false })
  })

  it('cancels a paid booking with the refund the service’s rule gives, waiting for an owner', async () => {
    const cancelled = await changeOwnBooking(
      await fresh(),
      first(),
      { kind: 'cancel', reference: made.paid.reference },
      NOW,
    )
    if (!cancelled.ok) throw new Error(`cancellation refused: ${cancelled.error.code}`)
    expect(cancelled.value.cancelled).toEqual({ refunded: true, awaitsOwner: true })
    expect(cancelled.value.booking.status).toBe('cancelledByClient')
    const { docs: refunds } = await payload.find({
      collection: 'refunds',
      where: { booking: { equals: made.paid.id } },
      depth: 0,
    })
    expect(refunds).toHaveLength(1)
    expect(refunds[0]).toMatchObject({
      amountPaise: 50_000,
      status: 'awaitingApproval',
      reason: 'cancelledByClient',
    })
  })
})

describe('documents (docs/20 §7.3)', () => {
  it('lists the account’s certificates, a revoked one with no download, and no one else’s', async () => {
    const own = await listOwnCertificates(await fresh(), first())
    expect(own.map((doc) => [doc.id, doc.status, doc.downloadable])).toEqual(
      expect.arrayContaining([
        [certificates.valid.id, 'valid', true],
        [certificates.revoked.id, 'revoked', false],
      ]),
    )
    expect(own.map((doc) => doc.id)).not.toContain(certificates.others.id)
  })

  it('hands back a valid certificate with its download audited in the account’s name', async () => {
    const answer = await download(await fresh(), first(), {
      kind: 'certificate',
      id: certificates.valid.id,
    })
    expect(answer.ok && answer.value.filename).toBe(`${certificates.valid.certificateId}.pdf`)
    expect(await auditOf('certificates', certificates.valid.id)).toContainEqual({
      action: 'download-certificate',
      actorId: `account:${accounts.first.id}`,
    })
  })

  it('has no PDF for a revoked certificate, and none of another account’s', async () => {
    const req = await fresh()
    expect(
      await download(req, first(), { kind: 'certificate', id: certificates.revoked.id }),
    ).toEqual({ ok: false, error: { code: 'not-available' } })
    expect(
      await download(req, first(), { kind: 'certificate', id: certificates.others.id }),
    ).toEqual({ ok: false, error: { code: 'not-found' } })
    expect(
      (await auditOf('certificates', certificates.others.id)).filter(
        (entry) => entry.action === 'download-certificate',
      ),
    ).toEqual([])
  })
})

describe('invoices (docs/20 §7.4; D-118)', () => {
  it('show no amount and give no PDF while prices are hidden', async () => {
    await setFlags({ pricesPublic: false })
    const req = await fresh()
    const own = await listOwnInvoices(req, first())
    expect(own.map((doc) => doc.id)).toEqual([invoiceIds.own])
    expect(own[0]).toMatchObject({ totalPaise: null, downloadable: false, number: 'FAKE-ACC-1' })
    expect(await download(req, first(), { kind: 'invoice', id: invoiceIds.own })).toEqual({
      ok: false,
      error: { code: 'prices-hidden' },
    })
    expect(await download(req, first(), { kind: 'invoice', id: invoiceIds.others })).toEqual({
      ok: false,
      error: { code: 'not-found' },
    })
  })

  it('show the total and give the PDF, audited, once prices are public', async () => {
    await setFlags({ pricesPublic: true })
    const req = await fresh()
    const own = await listOwnInvoices(req, first())
    expect(own[0]).toMatchObject({ totalPaise: 150_000, downloadable: true })
    const answer = await download(req, first(), { kind: 'invoice', id: invoiceIds.own })
    expect(answer.ok && answer.value.filename).toBe('FAKE-ACC-1.pdf')
    expect(await auditOf('invoices', invoiceIds.own)).toContainEqual({
      action: 'download-invoice',
      actorId: `account:${accounts.first.id}`,
    })
    expect(await download(req, second(), { kind: 'invoice', id: invoiceIds.own })).toEqual({
      ok: false,
      error: { code: 'not-found' },
    })
    await setFlags({ pricesPublic: false })
  })
})
