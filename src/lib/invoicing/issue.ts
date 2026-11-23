import 'server-only'

import type { Payload, PayloadRequest } from 'payload'

import type { InvoiceDocument } from '@/lib/pdf/invoice'
import { err, ok, type Result } from '@/lib/result'
import { istDay } from '@/lib/time/ist'
import {
  isPassing,
  type ZohoDocumentInput,
  type ZohoError,
  type ZohoIssued,
} from '@/lib/zoho/books'
import type { Booking, Invoice, Payment, Person, Refund, Service } from '@/payload-types'

import type { DocumentsDeps } from './deps'
import {
  documentLine,
  lineDescription,
  taxOf,
  toSupplierDetails,
  type MirrorLine,
  type MirrorTotals,
  type SupplierDetails,
} from './lines'

/**
 * B3 and the credit note on a refund (docs/06 B3, B7; docs/16 §2, §5; D-13). On a captured
 * payment the platform asks Zoho Books for the tax invoice and records the payment against it;
 * when a refund is processed it asks for a credit note against that invoice. Each document is
 * mirrored in `invoices` once per cause (`payment:<id>:taxInvoice`, `refund:<id>:creditNote`),
 * and Zoho finds an earlier attempt's document by a reference made from the same ids
 * (`<booking reference>/P<payment id>`, `/R<refund id>`), so a retried job never issues twice.
 *
 * Every write commits on its own, outside the job's transaction, so what Zoho made is never
 * forgotten by a rolled-back attempt. The totals are the platform's (CLAUDE.md #5) and Zoho's
 * must equal them, or the document is marked failed and the job fails where the team sees it.
 * A document waits (`pending`) while IIIC's GSTIN or the Zoho settings are missing (docs/16 §10).
 *
 * The client's PDF is printed through the kit's invoice.html once Zoho has numbered the document,
 * and only when every fact it prints is supplied; it goes to the private bucket. Logs and errors
 * hold codes and ids, never a name or an amount (CLAUDE.md, Logs).
 */

export type DocumentOutcome = {
  outcome:
    | 'issued'
    | 'already-issued'
    | 'void'
    | 'not-captured'
    | 'not-processed'
    | 'supplier-gstin-missing'
    | 'not-configured'
    | 'invoice-not-issued'
  invoiceId?: number
  pdf?: 'stored' | 'not-stored' | 'no-store' | 'waiting-for-inputs'
}

/** Left the document `failed`: the job throws so Payload tries again, then shows it failed. */
export type DocumentsError =
  | { code: 'not-found' }
  | { code: 'no-price' }
  | { code: 'amount-mismatch' }
  | { code: 'totals-mismatch' }
  | { code: 'zoho'; reason: ZohoError['code']; passing: boolean }

const KEY = {
  invoice: (paymentId: number) => `payment:${paymentId}:taxInvoice`,
  creditNote: (refundId: number) => `refund:${refundId}:creditNote`,
}

const idOf = (value: number | { id: number } | null | undefined): number | null =>
  value == null ? null : typeof value === 'number' ? value : value.id

async function findMirror(payload: Payload, key: string): Promise<Invoice | null> {
  const { docs } = await payload.find({
    collection: 'invoices',
    where: { idempotencyKey: { equals: key } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return docs[0] ?? null
}

async function readSupplier(payload: Payload): Promise<SupplierDetails> {
  const settings = await payload.findGlobal({
    slug: 'settings',
    select: { legal: true, bank: true },
    depth: 0,
    overrideAccess: true,
  })
  return toSupplierDetails(settings)
}

type MirrorData = Pick<Invoice, 'kind' | 'booking' | 'payment' | 'refund' | 'against' | 'buyer'> & {
  lines: MirrorLine[] | null
  totals: MirrorTotals | null
}

/**
 * The mirror for a key: made `pending` the first time, its buyer, lines and totals brought up to
 * date while it has not been issued. Two attempts at once meet at the unique key; the second
 * reads the first's row.
 */
async function upsertMirror(payload: Payload, key: string, data: MirrorData): Promise<Invoice> {
  const content = {
    ...data,
    lines: data.lines ?? [],
    totals: data.totals ?? {},
  }
  const existing = await findMirror(payload, key)
  if (existing) {
    if (existing.status === 'issued' || existing.status === 'void') return existing
    return payload.update({
      collection: 'invoices',
      id: existing.id,
      data: content,
      depth: 0,
      overrideAccess: true,
    })
  }
  try {
    return await payload.create({
      collection: 'invoices',
      data: { ...content, status: 'pending', idempotencyKey: key },
      depth: 0,
      overrideAccess: true,
    })
  } catch (error) {
    const raced = await findMirror(payload, key)
    if (raced) return raced
    throw error
  }
}

async function mark(
  payload: Payload,
  mirror: Invoice,
  data: Partial<
    Pick<Invoice, 'status' | 'failureCode' | 'number' | 'zohoId' | 'issuedAt' | 'pdfKey'>
  >,
): Promise<Invoice> {
  return payload.update({
    collection: 'invoices',
    id: mirror.id,
    data,
    depth: 0,
    overrideAccess: true,
  })
}

/** Zoho's answer, or the mirror marked failed with the reason. */
async function zohoFailed(
  payload: Payload,
  mirror: Invoice,
  error: ZohoError,
): Promise<Result<never, DocumentsError>> {
  await mark(payload, mirror, { status: 'failed', failureCode: `zoho-${error.code}` })
  return err({ code: 'zoho', reason: error.code, passing: isPassing(error) })
}

/** Zoho's totals must be the platform's, to the paisa (docs/16 §5). */
function sameTotals(issued: ZohoIssued, totals: MirrorTotals): boolean {
  return issued.totalPaise === totals.totalPaise && issued.taxPaise === taxOf(totals)
}

function buyerOf(booking: Booking): { person: Person | null; name: string | null } {
  const person = (
    typeof booking.bookedBy === 'object' && booking.bookedBy
      ? booking.bookedBy
      : typeof booking.person === 'object'
        ? booking.person
        : null
  ) as Person | null
  return { person, name: person?.fullName?.trim() || null }
}

/** The client's PDF, printed once every fact it holds is supplied, kept in the private bucket. */
async function attachPdf(
  deps: DocumentsDeps,
  payload: Payload,
  mirror: Invoice,
  doc: InvoiceDocument,
): Promise<{ mirror: Invoice; pdf: NonNullable<DocumentOutcome['pdf']> }> {
  if (mirror.pdfKey) return { mirror, pdf: 'stored' }
  if (!deps.store) return { mirror, pdf: 'no-store' }
  const rendered = await deps.renderPdf(doc)
  if (!rendered.ok) {
    payload.logger.info({
      msg: 'Invoice PDF not made',
      invoice: mirror.id,
      outcome: rendered.error.code,
    })
    return {
      mirror,
      pdf: rendered.error.code === 'placeholders' ? 'waiting-for-inputs' : 'not-stored',
    }
  }
  const key = `invoices/${mirror.id}.pdf`
  const stored = await deps.store.put(key, rendered.value.pdf)
  if (!stored.ok) return { mirror, pdf: 'not-stored' }
  return { mirror: await mark(payload, mirror, { pdfKey: key }), pdf: 'stored' }
}

function invoiceDocument(
  mirror: Invoice,
  issued: ZohoIssued,
  supplier: SupplierDetails,
  reference: string,
  line: MirrorLine,
  totals: MirrorTotals,
): InvoiceDocument {
  return {
    kind: mirror.kind,
    number: issued.number,
    issuedOn: issued.date,
    dueOn: issued.dueDate,
    paymentTerms: issued.paymentTerms,
    reference,
    reverseCharge: issued.reverseCharge,
    rateBasisPoints: line.gstRateBasisPoints,
    supplier: {
      gstin: supplier.gstin,
      udyam: supplier.udyam,
      address: supplier.address,
      email: supplier.email,
      stateCode: supplier.stateCode,
      // No input supplies these yet (proposed I-50): the PDF waits for them.
      signatory: null,
      signatureNote: null,
    },
    bank: { ...supplier.bank, upiId: null },
    buyer: {
      name: mirror.buyer?.name ?? '',
      address: mirror.buyer?.address ?? null,
      gstin: mirror.buyer?.gstin ?? null,
      stateCode: mirror.buyer?.stateCode ?? null,
    },
    lines: [
      {
        description: line.description,
        detail: null,
        sacCode: line.sacCode,
        quantity: line.quantity,
        taxablePaise: line.taxablePaise,
      },
    ],
    totals,
  }
}

/** B3: the tax invoice for a captured payment, and the payment recorded against it. */
export async function issueInvoiceForPayment(
  deps: DocumentsDeps,
  req: PayloadRequest,
  { paymentId }: { paymentId: number },
): Promise<Result<DocumentOutcome, DocumentsError>> {
  const { payload } = req
  const payment = (await payload.findByID({
    collection: 'payments',
    id: paymentId,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })) as Payment | null
  if (!payment) return err({ code: 'not-found' })
  if (!['captured', 'partRefunded', 'refunded'].includes(payment.status)) {
    return ok({ outcome: 'not-captured' })
  }
  const key = KEY.invoice(payment.id)
  const known = await findMirror(payload, key)
  if (known?.status === 'void') return ok({ outcome: 'void', invoiceId: known.id })
  if (known?.status === 'issued' && known.pdfKey) {
    return ok({ outcome: 'already-issued', invoiceId: known.id, pdf: 'stored' })
  }

  const booking = (await payload.findByID({
    collection: 'bookings',
    id: idOf(payment.booking) as number,
    depth: 1,
    overrideAccess: true,
    disableErrors: true,
  })) as Booking | null
  if (!booking) return err({ code: 'not-found' })
  const service = booking.service as Service | number
  const serviceName = typeof service === 'object' ? service.name : null
  const { person, name } = buyerOf(booking)
  const total = booking.price?.totalPaise
  const rate = booking.price?.gstRateBasisPoints
  if (!serviceName || !person || !name || total == null || rate == null) {
    return err({ code: 'no-price' })
  }

  const supplier = await readSupplier(payload)
  const computed = documentLine({
    description: lineDescription(serviceName, booking.optionLabel),
    sacCode: booking.price?.sacCode ?? null,
    totalPaise: total,
    rate,
    supplierStateCode: supplier.stateCode,
    // The platform keeps no buyer address yet: the place of supply is the supplier's state.
    buyerStateCode: null,
  })
  const mirror = await upsertMirror(payload, key, {
    kind: 'taxInvoice',
    booking: booking.id,
    payment: payment.id,
    refund: null,
    against: null,
    buyer: { name, gstin: null, stateCode: null, address: null },
    lines: computed.ok ? [computed.value.line] : null,
    totals: computed.ok ? computed.value.totals : null,
  })
  if (payment.amountPaise !== total) {
    await mark(payload, mirror, { status: 'failed', failureCode: 'amount-mismatch' })
    return err({ code: 'amount-mismatch' })
  }
  if (!computed.ok) {
    await mark(payload, mirror, { failureCode: computed.error.code })
    return ok({ outcome: 'supplier-gstin-missing', invoiceId: mirror.id })
  }
  const zoho = deps.zoho()
  if (!zoho.ok) {
    await mark(payload, mirror, { failureCode: 'zoho-not-configured' })
    return ok({ outcome: 'not-configured', invoiceId: mirror.id })
  }

  const { line, totals } = computed.value
  const input: ZohoDocumentInput = {
    reference: `${booking.reference}/P${payment.id}`,
    date: istDay(deps.now()),
    customer: { name, key: `P-${person.id}`, gstin: null },
    lines: [
      {
        description: line.description,
        sacCode: line.sacCode,
        quantity: 1,
        totalPaise: total,
        rate,
      },
    ],
    interState: totals.igstPaise > 0,
  }
  const issued = await zoho.value.issueInvoice(input)
  if (!issued.ok) return zohoFailed(payload, mirror, issued.error)
  if (!sameTotals(issued.value, totals)) {
    await mark(payload, mirror, { status: 'failed', failureCode: 'totals-mismatch' })
    return err({ code: 'totals-mismatch' })
  }
  const recorded = await zoho.value.recordPayment({
    reference: payment.gatewayPaymentId ?? payment.receipt,
    customerId: issued.value.customerId,
    invoiceId: issued.value.zohoId,
    amountPaise: payment.amountPaise,
    date: istDay(payment.capturedAt ? new Date(payment.capturedAt) : deps.now()),
  })
  if (!recorded.ok) return zohoFailed(payload, mirror, recorded.error)

  const done =
    mirror.status === 'issued'
      ? mirror
      : await mark(payload, mirror, {
          status: 'issued',
          failureCode: null,
          number: issued.value.number,
          zohoId: issued.value.zohoId,
          issuedAt: deps.now().toISOString(),
        })
  const doc = invoiceDocument(done, issued.value, supplier, booking.reference, line, totals)
  const { pdf } = await attachPdf(deps, payload, done, doc)
  return ok({
    outcome: mirror.status === 'issued' ? 'already-issued' : 'issued',
    invoiceId: done.id,
    pdf,
  })
}

/** The credit note against a payment's invoice when a refund is processed (B7, docs/16 §9). */
export async function issueCreditNoteForRefund(
  deps: DocumentsDeps,
  req: PayloadRequest,
  { refundId }: { refundId: number },
): Promise<Result<DocumentOutcome, DocumentsError>> {
  const { payload } = req
  const refund = (await payload.findByID({
    collection: 'refunds',
    id: refundId,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })) as Refund | null
  if (!refund) return err({ code: 'not-found' })
  if (refund.status !== 'processed') return ok({ outcome: 'not-processed' })
  const paymentId = idOf(refund.payment) as number
  const key = KEY.creditNote(refund.id)
  const known = await findMirror(payload, key)
  if (known?.status === 'void') return ok({ outcome: 'void', invoiceId: known.id })
  if (known?.status === 'issued' && known.pdfKey) {
    return ok({ outcome: 'already-issued', invoiceId: known.id, pdf: 'stored' })
  }

  const invoice = await findMirror(payload, KEY.invoice(paymentId))
  const invoiceLine = invoice?.lines?.[0]
  const booking = (await payload.findByID({
    collection: 'bookings',
    id: (idOf(refund.booking) ?? idOf(invoice?.booking)) as number,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })) as Booking | null
  if (!booking) return err({ code: 'not-found' })
  const rate = invoiceLine?.gstRateBasisPoints ?? booking.price?.gstRateBasisPoints
  const description = invoiceLine?.description
  const supplier = await readSupplier(payload)
  const computed =
    rate != null && description
      ? documentLine({
          description,
          sacCode: invoiceLine?.sacCode ?? null,
          totalPaise: refund.amountPaise,
          rate,
          supplierStateCode: supplier.stateCode,
          buyerStateCode: invoice?.buyer?.stateCode ?? null,
        })
      : null
  const mirror = await upsertMirror(payload, key, {
    kind: 'creditNote',
    booking: booking.id,
    payment: paymentId,
    refund: refund.id,
    against: invoice?.id ?? null,
    buyer: invoice?.buyer ?? {},
    lines: computed?.ok ? [computed.value.line] : null,
    totals: computed?.ok ? computed.value.totals : null,
  })
  // The credit note answers an issued invoice; until there is one it waits with the reason.
  if (!invoice || invoice.status !== 'issued' || !invoice.zohoId || !computed) {
    await mark(payload, mirror, { failureCode: 'invoice-not-issued' })
    return ok({ outcome: 'invoice-not-issued', invoiceId: mirror.id })
  }
  if (!computed.ok) {
    await mark(payload, mirror, { failureCode: computed.error.code })
    return ok({ outcome: 'supplier-gstin-missing', invoiceId: mirror.id })
  }
  const zoho = deps.zoho()
  if (!zoho.ok) {
    await mark(payload, mirror, { failureCode: 'zoho-not-configured' })
    return ok({ outcome: 'not-configured', invoiceId: mirror.id })
  }

  const { line, totals } = computed.value
  const person = idOf(booking.bookedBy) ?? idOf(booking.person)
  const issued = await zoho.value.issueCreditNote({
    reference: `${booking.reference}/R${refund.id}`,
    date: istDay(deps.now()),
    customer: {
      name: invoice.buyer?.name ?? '',
      key: `P-${person}`,
      gstin: invoice.buyer?.gstin ?? null,
    },
    lines: [
      {
        description: line.description,
        sacCode: line.sacCode,
        quantity: 1,
        totalPaise: refund.amountPaise,
        rate: line.gstRateBasisPoints,
      },
    ],
    interState: totals.igstPaise > 0,
    invoiceId: invoice.zohoId,
  })
  if (!issued.ok) return zohoFailed(payload, mirror, issued.error)
  if (!sameTotals(issued.value, totals)) {
    await mark(payload, mirror, { status: 'failed', failureCode: 'totals-mismatch' })
    return err({ code: 'totals-mismatch' })
  }
  const done =
    mirror.status === 'issued'
      ? mirror
      : await mark(payload, mirror, {
          status: 'issued',
          failureCode: null,
          number: issued.value.number,
          zohoId: issued.value.zohoId,
          issuedAt: deps.now().toISOString(),
        })
  const doc = invoiceDocument(done, issued.value, supplier, booking.reference, line, totals)
  const { pdf } = await attachPdf(deps, payload, done, doc)
  return ok({
    outcome: mirror.status === 'issued' ? 'already-issued' : 'issued',
    invoiceId: done.id,
    pdf,
  })
}
