// @vitest-environment node
import type { PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DocumentStore, DocumentsDeps } from '@/lib/invoicing/deps'
import { documentLine, lineDescription, toSupplierDetails } from '@/lib/invoicing/lines'
import type { InvoiceDocument } from '@/lib/pdf/invoice'
import { err, ok } from '@/lib/result'
import { FakeZohoBooks } from '@/lib/zoho/fake'
import type { Booking, Invoice, Payment, Person, Refund, Service } from '@/payload-types'

vi.mock('server-only', () => ({}))

const { issueCreditNoteForRefund, issueInvoiceForPayment } = await import('@/lib/invoicing/issue')

// B3 and the credit note (docs/06 B3, B7; docs/16 §5) over an in-memory Payload: one mirror per
// key, Zoho asked once per document however often the job runs, the totals held to the
// platform's, a document waiting (not failing) on IIIC's setup, and the PDF printed only with
// every fact supplied. Every value is fake: the GSTIN is the format's textbook example, the rate
// and the amounts are test values, not IIIC's (I-28, I-29).

const FAKE_GSTIN = '24AAAAA0000A1Z5'
const NOW = new Date('2026-11-20T06:30:00Z')

type Rows = {
  payments: Payment[]
  bookings: Booking[]
  refunds: Refund[]
  invoices: Invoice[]
  people: Person[]
  services: Service[]
}

/** Just enough of Payload's local API for the documents module. */
function memoryPayload(rows: Rows, settings: () => unknown) {
  let nextId = 1000
  const byId = <T extends { id: number }>(list: T[], id: number) =>
    list.find((row) => row.id === id) ?? null
  const populate = (booking: Booking): Booking => ({
    ...booking,
    service: byId(rows.services, booking.service as number) ?? booking.service,
    person: byId(rows.people, booking.person as number) ?? booking.person,
    bookedBy: booking.bookedBy ? byId(rows.people, booking.bookedBy as number) : null,
  })
  const payload = {
    logger: { info: vi.fn(), error: vi.fn() },
    findByID: vi.fn(
      async ({ collection, id, depth }: { collection: keyof Rows; id: number; depth?: number }) => {
        const row = byId(rows[collection] as { id: number }[], id)
        if (row && collection === 'bookings' && depth) return populate(row as Booking)
        return row ? structuredClone(row) : null
      },
    ),
    find: vi.fn(async ({ where }: { where: { idempotencyKey: { equals: string } } }) => ({
      docs: rows.invoices
        .filter((row) => row.idempotencyKey === where.idempotencyKey.equals)
        .map((row) => structuredClone(row)),
    })),
    create: vi.fn(async ({ data }: { data: Partial<Invoice> }) => {
      if (rows.invoices.some((row) => row.idempotencyKey === data.idempotencyKey)) {
        throw new Error('unique')
      }
      const row = { ...data, id: ++nextId } as Invoice
      rows.invoices.push(row)
      return structuredClone(row)
    }),
    update: vi.fn(async ({ id, data }: { id: number; data: Partial<Invoice> }) => {
      const row = byId(rows.invoices, id) as Invoice
      Object.assign(row, data)
      return structuredClone(row)
    }),
    findGlobal: vi.fn(async () => settings()),
  }
  return payload
}

let rows: Rows
let settings: Record<string, unknown>
let zoho: FakeZohoBooks
let stored: Map<string, Uint8Array>
let rendered: InvoiceDocument[]
let deps: DocumentsDeps
let req: PayloadRequest

const store: DocumentStore = {
  put: async (key, bytes) => {
    stored.set(key, bytes)
    return ok(undefined)
  },
}

const SUPPLIED = {
  legal: {
    gstin: FAKE_GSTIN,
    udyam: 'UDYAM-GJ-00-0000000',
    address: 'Fake supplier line\nFake town',
    customerCare: { email: 'fake-care@example.com' },
  },
  bank: { bankName: 'Fake Bank', accountName: 'Fake', accountNumber: '0000', ifsc: 'FAKE0000000' },
}

beforeEach(() => {
  rows = {
    services: [{ id: 1, name: 'Fake session' } as Service],
    people: [{ id: 2, fullName: 'Fake Client' } as Person],
    bookings: [
      {
        id: 3,
        reference: 'IIIC-S-00001',
        service: 1,
        person: 2,
        optionLabel: 'Fake option',
        price: {
          totalPaise: 118_000,
          taxPaise: 18_000,
          gstRateBasisPoints: 1800,
          sacCode: '999999',
        },
      } as Booking,
    ],
    payments: [
      {
        id: 4,
        booking: 3,
        status: 'captured',
        amountPaise: 118_000,
        receipt: 'booking:3:checkout',
        gatewayPaymentId: 'pay_FAKE4',
        capturedAt: NOW.toISOString(),
      } as Payment,
    ],
    refunds: [
      {
        id: 5,
        payment: 4,
        booking: 3,
        status: 'processed',
        amountPaise: 59_000,
        reason: 'cancelledByClient',
        idempotencyKey: 'fake-refund-5',
      } as Refund,
    ],
    invoices: [],
  }
  settings = structuredClone(SUPPLIED)
  zoho = new FakeZohoBooks()
  stored = new Map()
  rendered = []
  deps = {
    zoho: () => ok(zoho),
    store,
    // As the real renderer does: a document still waiting for a fact is not printed.
    renderPdf: async (doc) => {
      rendered.push(doc)
      return doc.supplier.signatory
        ? ok({ html: '<html></html>', pdf: new Uint8Array([37, 80, 68, 70]) })
        : err({ code: 'placeholders', waitingFor: ['[[TODO: the signatory, I-50]]'] })
    },
    now: () => NOW,
  }
  req = { payload: memoryPayload(rows, () => settings) } as unknown as PayloadRequest
})

const invoiceRow = () => rows.invoices.find((row) => row.kind === 'taxInvoice') as Invoice
const noteRow = () => rows.invoices.find((row) => row.kind === 'creditNote') as Invoice

describe('documentLine and the supplier details', () => {
  it('splits an all-in amount into a line and totals that add up', () => {
    const made = documentLine({
      description: lineDescription('Fake session', 'Fake option'),
      sacCode: '999999',
      totalPaise: 118_000,
      rate: 1800,
      supplierStateCode: '24',
      buyerStateCode: null,
    })
    expect(made).toEqual({
      ok: true,
      value: {
        line: expect.objectContaining({ description: 'Fake session · Fake option', quantity: 1 }),
        totals: {
          taxablePaise: 100_000,
          cgstPaise: 9_000,
          sgstPaise: 9_000,
          igstPaise: 0,
          totalPaise: 118_000,
        },
      },
    })
    const other = documentLine({
      description: 'x',
      sacCode: null,
      totalPaise: 118_000,
      rate: 1800,
      supplierStateCode: '24',
      buyerStateCode: '27',
    })
    expect(other.ok && other.value.totals.igstPaise).toBe(18_000)
  })

  it('waits for the GSTIN, which names the supplier’s state', () => {
    expect(
      documentLine({
        description: 'x',
        sacCode: null,
        totalPaise: 1,
        rate: 1800,
        supplierStateCode: null,
        buyerStateCode: null,
      }),
    ).toEqual({
      ok: false,
      error: { code: 'supplier-gstin-missing' },
    })
  })

  it('reads the settings, empty fields as null, the site’s address while none is set', () => {
    expect(toSupplierDetails(SUPPLIED)).toMatchObject({
      gstin: FAKE_GSTIN,
      stateCode: '24',
      email: 'fake-care@example.com',
    })
    const empty = toSupplierDetails({ legal: { gstin: '  ' } })
    expect(empty).toMatchObject({ gstin: null, stateCode: null, udyam: null, address: null })
    expect(empty.email).toMatch(/@/)
    expect(toSupplierDetails(null).bank).toEqual({
      bankName: null,
      accountName: null,
      accountNumber: null,
      ifsc: null,
    })
  })
})

describe('issueInvoiceForPayment (B3)', () => {
  it('issues the invoice, records the payment, and mirrors Zoho’s number with the platform’s totals', async () => {
    const result = await issueInvoiceForPayment(deps, req, { paymentId: 4 })
    expect(result).toEqual({
      ok: true,
      value: { outcome: 'issued', invoiceId: invoiceRow().id, pdf: 'waiting-for-inputs' },
    })
    expect(invoiceRow()).toMatchObject({
      status: 'issued',
      number: 'FAKE-INV-00001',
      idempotencyKey: 'payment:4:taxInvoice',
      booking: 3,
      payment: 4,
      buyer: { name: 'Fake Client' },
      totals: {
        taxablePaise: 100_000,
        cgstPaise: 9_000,
        sgstPaise: 9_000,
        igstPaise: 0,
        totalPaise: 118_000,
      },
      issuedAt: NOW.toISOString(),
    })
    const [sent] = [...zoho.invoices.values()]
    expect(sent?.input).toMatchObject({
      reference: 'IIIC-S-00001/P4',
      date: '2026-11-20',
      customer: { name: 'Fake Client', key: 'P-2', gstin: null },
      lines: [
        {
          description: 'Fake session · Fake option',
          totalPaise: 118_000,
          rate: 1800,
          sacCode: '999999',
        },
      ],
      interState: false,
    })
    expect([...zoho.payments.values()]).toEqual([
      expect.objectContaining({
        reference: 'pay_FAKE4',
        amountPaise: 118_000,
        invoiceId: sent?.zohoId,
      }),
    ])
  })

  it('does it once, however often the job runs', async () => {
    await issueInvoiceForPayment(deps, req, { paymentId: 4 })
    await issueInvoiceForPayment(deps, req, { paymentId: 4 })
    expect(rows.invoices).toHaveLength(1)
    expect(zoho.invoices.size).toBe(1)
    expect(zoho.payments.size).toBe(1)
  })

  it('prints the PDF only once every fact is supplied, and keeps it in the store', async () => {
    // Nothing supplies the signatory yet (I-50): the PDF waits, the invoice does not.
    await issueInvoiceForPayment(deps, req, { paymentId: 4 })
    expect(rendered).toHaveLength(1)
    expect(stored.size).toBe(0)
    deps.renderPdf = async (doc) => {
      rendered.push(doc)
      return ok({ html: '', pdf: new Uint8Array([1]) })
    }
    const again = await issueInvoiceForPayment(deps, req, { paymentId: 4 })
    expect(again).toEqual({
      ok: true,
      value: { outcome: 'already-issued', invoiceId: invoiceRow().id, pdf: 'stored' },
    })
    expect(invoiceRow().pdfKey).toBe(`invoices/${invoiceRow().id}.pdf`)
    expect(rendered[1]).toMatchObject({
      kind: 'taxInvoice',
      number: 'FAKE-INV-00001',
      reference: 'IIIC-S-00001',
      supplier: { gstin: FAKE_GSTIN, stateCode: '24' },
      totals: { totalPaise: 118_000 },
    })
    // Once stored, a later run asks nothing of Zoho.
    const calls = zoho.calls.length
    await issueInvoiceForPayment(deps, req, { paymentId: 4 })
    expect(zoho.calls.length).toBe(calls)
  })

  it('makes no PDF without a store', async () => {
    deps.store = null
    const result = await issueInvoiceForPayment(deps, req, { paymentId: 4 })
    expect(result.ok && result.value.pdf).toBe('no-store')
    expect(rendered).toHaveLength(0)
  })

  it('waits, without failing, for the GSTIN and for the Zoho settings', async () => {
    settings = { legal: {}, bank: {} }
    expect(await issueInvoiceForPayment(deps, req, { paymentId: 4 })).toEqual({
      ok: true,
      value: { outcome: 'supplier-gstin-missing', invoiceId: invoiceRow().id },
    })
    expect(invoiceRow()).toMatchObject({ status: 'pending', failureCode: 'supplier-gstin-missing' })
    settings = structuredClone(SUPPLIED)
    deps.zoho = () => err({ code: 'not-configured', reason: 'missing' })
    expect(await issueInvoiceForPayment(deps, req, { paymentId: 4 })).toEqual({
      ok: true,
      value: { outcome: 'not-configured', invoiceId: invoiceRow().id },
    })
    expect(invoiceRow()).toMatchObject({ status: 'pending', failureCode: 'zoho-not-configured' })
    expect(rows.invoices).toHaveLength(1)
    expect(zoho.calls).toEqual([])
  })

  it('fails, for the job to retry, when Zoho is down, and succeeds on the retry', async () => {
    zoho.failNext = { code: 'unavailable' }
    expect(await issueInvoiceForPayment(deps, req, { paymentId: 4 })).toEqual({
      ok: false,
      error: { code: 'zoho', reason: 'unavailable', passing: true },
    })
    expect(invoiceRow()).toMatchObject({ status: 'failed', failureCode: 'zoho-unavailable' })
    const retried = await issueInvoiceForPayment(deps, req, { paymentId: 4 })
    expect(retried.ok && retried.value.outcome).toBe('issued')
    expect(invoiceRow()).toMatchObject({ status: 'issued', failureCode: null })
  })

  it('fails when Zoho’s totals differ from the platform’s by a paisa', async () => {
    zoho.taxSkewPaise = 1
    expect(await issueInvoiceForPayment(deps, req, { paymentId: 4 })).toEqual({
      ok: false,
      error: { code: 'totals-mismatch' },
    })
    expect(invoiceRow()).toMatchObject({ status: 'failed', failureCode: 'totals-mismatch' })
    expect(zoho.payments.size).toBe(0)
  })

  it('fails when the payment is not the booking’s total, and does nothing before capture', async () => {
    rows.payments[0]!.amountPaise = 100_000
    expect(await issueInvoiceForPayment(deps, req, { paymentId: 4 })).toEqual({
      ok: false,
      error: { code: 'amount-mismatch' },
    })
    expect(zoho.calls).toEqual([])
    rows.payments[0]!.status = 'created'
    expect(await issueInvoiceForPayment(deps, req, { paymentId: 4 })).toEqual({
      ok: true,
      value: { outcome: 'not-captured' },
    })
    expect(await issueInvoiceForPayment(deps, req, { paymentId: 99 })).toEqual({
      ok: false,
      error: { code: 'not-found' },
    })
  })

  it('bills the guardian who booked, not the person the session is for', async () => {
    rows.people.push({ id: 6, fullName: 'Fake Guardian' } as Person)
    rows.bookings[0]!.bookedBy = 6
    await issueInvoiceForPayment(deps, req, { paymentId: 4 })
    expect(invoiceRow().buyer?.name).toBe('Fake Guardian')
    expect([...zoho.invoices.values()][0]?.input.customer.key).toBe('P-6')
  })
})

describe('issueCreditNoteForRefund', () => {
  it('waits for the invoice it answers', async () => {
    expect(await issueCreditNoteForRefund(deps, req, { refundId: 5 })).toEqual({
      ok: true,
      value: { outcome: 'invoice-not-issued', invoiceId: noteRow().id },
    })
    expect(noteRow()).toMatchObject({ status: 'pending', failureCode: 'invoice-not-issued' })
  })

  it('issues a credit note for the refunded amount against the invoice, once', async () => {
    await issueInvoiceForPayment(deps, req, { paymentId: 4 })
    const first = await issueCreditNoteForRefund(deps, req, { refundId: 5 })
    await issueCreditNoteForRefund(deps, req, { refundId: 5 })
    expect(first.ok && first.value.outcome).toBe('issued')
    expect(zoho.creditNotes.size).toBe(1)
    expect(noteRow()).toMatchObject({
      status: 'issued',
      number: 'FAKE-CN-00002',
      idempotencyKey: 'refund:5:creditNote',
      refund: 5,
      against: invoiceRow().id,
      buyer: { name: 'Fake Client' },
      totals: {
        taxablePaise: 50_000,
        cgstPaise: 4_500,
        sgstPaise: 4_500,
        igstPaise: 0,
        totalPaise: 59_000,
      },
    })
    const [sent] = [...zoho.creditNotes.values()]
    expect(sent?.input).toMatchObject({
      reference: 'IIIC-S-00001/R5',
      invoiceId: invoiceRow().zohoId,
      lines: [{ totalPaise: 59_000, rate: 1800 }],
    })
  })

  it('does nothing for a refund not yet processed', async () => {
    rows.refunds[0]!.status = 'processing'
    expect(await issueCreditNoteForRefund(deps, req, { refundId: 5 })).toEqual({
      ok: true,
      value: { outcome: 'not-processed' },
    })
    expect(rows.invoices).toHaveLength(0)
  })
})
