import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { DocumentsDeps } from '@/lib/invoicing/deps'
import { ok } from '@/lib/result'
import { FakeZohoBooks } from '@/lib/zoho/fake'
import type {
  Booking,
  Payment,
  Person,
  PlatformSettings,
  Practitioner,
  Service,
  User,
} from '@/payload-types'
import config from '@/payload.config'

vi.mock('server-only', () => ({}))

const { issueCreditNoteForRefund, issueInvoiceForPayment } = await import('@/lib/invoicing/issue')

// The documents module against the real Postgres (docs/16 §2, §5; docs/06 B3, B7): one mirror
// per key under the unique index however often B3 runs, the invoice and the payment record asked
// of Zoho once, the credit note against the invoice for a processed refund, and the mirror read by
// owners and finance only. Zoho Books is the fake. Every value is obviously fake (the GSTIN is
// the format's textbook example, the rate and the amounts are test values) and removed at the
// end; the settings are put back.

let payload: Payload
const TAG = 'int.documents'
const REF = 'INT-DOC-'
let service: Service
let person: Person
let practitioner: Practitioner
const staff = {} as Record<'owner' | 'operator' | 'finance', User>
let savedSettings: Pick<PlatformSettings, 'legal' | 'bank'>
let made = 0

const zoho = new FakeZohoBooks()
const deps: DocumentsDeps = {
  zoho: () => ok(zoho),
  store: null,
  renderPdf: async () => {
    throw new Error('no store: nothing is rendered')
  },
  now: () => new Date(),
}

const fresh = (): Promise<PayloadRequest> => createLocalReq({}, payload)

/** A fixed hour far ahead, in a day no other test uses. */
const at = (minutes: number) => new Date(Date.UTC(2099, 2, 17, 4, 30) + minutes * 60_000)

async function removeTestData() {
  const { docs: bookings } = await payload.find({
    collection: 'bookings',
    where: { reference: { like: REF } },
    pagination: false,
    depth: 0,
  })
  const ids = bookings.map((booking) => booking.id)
  if (ids.length) {
    await payload.delete({ collection: 'invoices', where: { booking: { in: ids } } })
    await payload.delete({ collection: 'refunds', where: { booking: { in: ids } } })
    await payload.delete({ collection: 'payments', where: { booking: { in: ids } } })
  }
  await payload.delete({ collection: 'bookings', where: { reference: { like: REF } } })
  await payload.delete({ collection: 'practitioners', where: { publicName: { like: TAG } } })
  await payload.delete({ collection: 'services', where: { slug: { like: 'int-documents' } } })
  await payload.delete({ collection: 'people', where: { fullName: { like: TAG } } })
  await payload.delete({ collection: 'users', where: { email: { like: `${TAG}.` } } })
}

/** A confirmed, paid booking and its captured payment, as the payments module leaves them. */
async function paidBooking(): Promise<{ booking: Booking; payment: Payment }> {
  made += 1
  const booking = await payload.create({
    collection: 'bookings',
    data: {
      reference: `${REF}${Date.now()}-${made}`,
      type: 'session',
      status: 'confirmed',
      paymentStatus: 'paid',
      service: service.id,
      person: person.id,
      practitioner: practitioner.id,
      startsAt: at(made * 60).toISOString(),
      endsAt: at(made * 60 + 30).toISOString(),
      price: { totalPaise: 118_000, taxPaise: 18_000, gstRateBasisPoints: 1800, sacCode: '000000' },
    } as Booking,
  })
  const payment = await payload.create({
    collection: 'payments',
    data: {
      booking: booking.id,
      kind: 'checkout',
      gateway: 'razorpay',
      status: 'captured',
      amountPaise: 118_000,
      currency: 'INR',
      receipt: `booking:${booking.id}:checkout`,
      gatewayOrderId: `order_FAKEDOC${booking.id}`,
      gatewayPaymentId: `pay_FAKEDOC${booking.id}`,
      capturedAt: new Date().toISOString(),
    } as Payment,
  })
  return { booking, payment }
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  savedSettings = await payload.findGlobal({
    slug: 'settings',
    select: { legal: true, bank: true },
    depth: 0,
  })
  for (const role of ['owner', 'operator', 'finance'] as const) {
    staff[role] = await payload.create({
      collection: 'users',
      data: {
        name: `Fake ${role}`,
        email: `${TAG}.${role}@example.invalid`,
        password: 'test-only-password-documents',
        roles: [role],
      },
    })
  }
  service = await payload.create({
    collection: 'services',
    data: {
      name: `Fake service ${TAG}`,
      type: 'session',
      slug: `int-documents-${Date.now()}`,
      register: 'counselling',
      format: 'online',
    } as Service,
  })
  practitioner = await payload.create({
    collection: 'practitioners',
    data: { publicName: `Fake ${TAG}` } as Practitioner,
  })
  person = await payload.create({
    collection: 'people',
    data: { fullName: `Fake Person ${TAG}` } as Person,
  })
  await payload.updateGlobal({
    slug: 'settings',
    data: { legal: { ...savedSettings.legal, gstin: '24AAAAA0000A1Z5' } },
  })
})

afterAll(async () => {
  await payload.updateGlobal({
    slug: 'settings',
    data: { legal: savedSettings.legal, bank: savedSettings.bank },
  })
  await removeTestData()
})

describe('B3 against Postgres', () => {
  it('issues one invoice and one payment record, however often it runs', async () => {
    const { booking, payment } = await paidBooking()
    const runs = await Promise.all([
      issueInvoiceForPayment(deps, await fresh(), { paymentId: payment.id }),
      issueInvoiceForPayment(deps, await fresh(), { paymentId: payment.id }),
    ])
    const again = await issueInvoiceForPayment(deps, await fresh(), { paymentId: payment.id })
    for (const run of [...runs, again]) expect(run.ok).toBe(true)
    const { docs } = await payload.find({
      collection: 'invoices',
      where: { payment: { equals: payment.id } },
      depth: 0,
    })
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({
      kind: 'taxInvoice',
      status: 'issued',
      idempotencyKey: `payment:${payment.id}:taxInvoice`,
      booking: booking.id,
      totals: { taxablePaise: 100_000, cgstPaise: 9_000, sgstPaise: 9_000, totalPaise: 118_000 },
    })
    expect(docs[0]?.number).toMatch(/^FAKE-INV-/)
    const reference = `${booking.reference}/P${payment.id}`
    expect(zoho.invoices.has(reference)).toBe(true)
    expect(
      [...zoho.payments.keys()].filter((key) => key === payment.gatewayPaymentId),
    ).toHaveLength(1)
  })

  it('issues the credit note against the invoice once the refund is processed', async () => {
    const { booking, payment } = await paidBooking()
    await issueInvoiceForPayment(deps, await fresh(), { paymentId: payment.id })
    const refund = await payload.create({
      collection: 'refunds',
      data: {
        payment: payment.id,
        booking: booking.id,
        status: 'approved',
        amountPaise: 59_000,
        reason: 'cancelledByIiic',
        idempotencyKey: `fake-documents-refund-${payment.id}`,
      },
    })
    const early = await issueCreditNoteForRefund(deps, await fresh(), { refundId: refund.id })
    expect(early).toEqual({ ok: true, value: { outcome: 'not-processed' } })
    await payload.update({ collection: 'refunds', id: refund.id, data: { status: 'processing' } })
    await payload.update({
      collection: 'refunds',
      id: refund.id,
      data: { status: 'processed', gatewayRefundId: `rfnd_FAKEDOC${refund.id}` },
    })
    const note = await issueCreditNoteForRefund(deps, await fresh(), { refundId: refund.id })
    expect(note.ok && note.value.outcome).toBe('issued')
    const { docs } = await payload.find({
      collection: 'invoices',
      where: { refund: { equals: refund.id } },
      depth: 0,
    })
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({
      kind: 'creditNote',
      status: 'issued',
      idempotencyKey: `refund:${refund.id}:creditNote`,
      totals: { taxablePaise: 50_000, totalPaise: 59_000 },
    })
  })
})

describe('who reads the mirror (docs/16 §2)', () => {
  it('owners and finance read invoices; an operator and a visitor do not, and nobody writes', async () => {
    const { payment } = await paidBooking()
    await issueInvoiceForPayment(deps, await fresh(), { paymentId: payment.id })
    const where = { payment: { equals: payment.id } }
    for (const role of ['owner', 'finance'] as const) {
      const { totalDocs } = await payload.find({
        collection: 'invoices',
        where,
        overrideAccess: false,
        user: { ...staff[role], collection: 'users', _strategy: 'totp' } as User,
      })
      expect(totalDocs, role).toBe(1)
    }
    await expect(
      payload.find({
        collection: 'invoices',
        where,
        overrideAccess: false,
        user: { ...staff.operator, collection: 'users', _strategy: 'totp' } as User,
      }),
    ).rejects.toThrow()
    await expect(
      payload.find({ collection: 'invoices', where, overrideAccess: false }),
    ).rejects.toThrow()
    await expect(
      payload.create({
        collection: 'invoices',
        data: { kind: 'taxInvoice', status: 'issued', idempotencyKey: 'fake-outside-write' },
        overrideAccess: false,
        user: { ...staff.owner, collection: 'users', _strategy: 'totp' } as User,
      }),
    ).rejects.toThrow()
  })
})
