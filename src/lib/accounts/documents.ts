import 'server-only'

import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import { recordAudit } from '@/lib/audit/record'
import type { CertificateStore } from '@/lib/certificates/contract'
import { certificateStoreFor, isPdfKey } from '@/lib/certificates/store'
import { sha256Hex } from '@/lib/certificates/token'
import { env } from '@/lib/env'
import { invoiceFilename } from '@/lib/invoicing/download'
import { invoiceFilesFor, isInvoicePdfKey, type InvoiceFiles } from '@/lib/invoicing/store'
import { err, ok, type Result } from '@/lib/result'
import { readFlags } from '@/lib/settings/source'

import type {
  AccountCertificate,
  AccountInvoice,
  DownloadOwnDocument,
  ListOwnCertificates,
  ListOwnInvoices,
} from './contract'
import { accountActor, findOwnCertificates, findOwnInvoices, ownPersonIds } from './scope'

/**
 * My IIIC's documents and invoices (docs/20 §7.3, §7.4; D-118, D-124).
 *
 * Certificates of every one of the account's records: the ID, the programme, the completion day,
 * Valid or Revoked, and the PDF of a valid one from the private bucket (docs/18 §4), checked
 * against the SHA-256 kept at issue. Proposals stay on their tracked link and are not listed yet.
 *
 * Invoices and credit notes of the account's bookings: Zoho's number, the kind, the day and the
 * status. While `prices_public` is off there is no amount and no PDF (D-21, D-94, D-101, D-118);
 * the receipt's email offers the PDF by reply. Once prices are public, the total shows and the
 * PDF downloads.
 *
 * Each download is the account's own record, checked through the scope before anything is read,
 * and is written to the audit log (`download-certificate`, `download-invoice`; actor
 * `account:<id>`) before the bytes are handed back, so a download the log could not record does
 * not happen (CLAUDE.md #6).
 */

/** The invoices a person sees: documents Zoho issued, and those since voided. */
const SHOWN_INVOICE_STATUSES = ['issued', 'void'] as const

export const listOwnCertificates: ListOwnCertificates = async (req, account) => {
  const ids = await ownPersonIds(req, account)
  const docs = await findOwnCertificates(req, ids, {
    select: {
      certificateId: true,
      programmeName: true,
      completedOn: true,
      status: true,
      pdfKey: true,
    },
    sort: '-completedOn',
  })
  return docs.map((doc): AccountCertificate => ({
    id: doc.id,
    certificateId: doc.certificateId,
    programmeName: doc.programmeName,
    completedOn: doc.completedOn,
    status: doc.status,
    downloadable: doc.status === 'valid' && typeof doc.pdfKey === 'string' && isPdfKey(doc.pdfKey),
  }))
}

export const listOwnInvoices: ListOwnInvoices = async (req, account) => {
  const ids = await ownPersonIds(req, account)
  const { pricesPublic } = await readFlags(req.payload, req)
  const docs = await findOwnInvoices(req, ids, {
    select: {
      number: true,
      kind: true,
      status: true,
      issuedAt: true,
      totals: { totalPaise: true },
      pdfKey: true,
    },
    where: { status: { in: [...SHOWN_INVOICE_STATUSES] } },
    sort: '-issuedAt',
  })
  return docs.map((doc): AccountInvoice => ({
    id: doc.id,
    number: doc.number ?? null,
    kind: doc.kind,
    issuedOn: doc.issuedAt ? new Date(doc.issuedAt) : null,
    status: doc.status,
    // No amount leaves the server while prices are hidden (D-21).
    totalPaise: pricesPublic ? (doc.totals?.totalPaise ?? null) : null,
    downloadable: pricesPublic && doc.status === 'issued' && isInvoicePdfKey(doc.pdfKey),
  }))
}

/** Where the PDFs are read from: the private bucket, a folder locally and in CI, memory in tests. */
export type DocumentFiles = {
  certificates: () => Result<CertificateStore, { code: 'storage-missing' }>
  invoices: () => InvoiceFiles | null
}

const DocumentInput = z.strictObject({
  kind: z.enum(['certificate', 'invoice']),
  id: z.number().int().positive().max(2_147_483_647),
})

/** `DownloadOwnDocument`, given where the files are. */
export function downloadOwnDocumentWith(files: DocumentFiles): DownloadOwnDocument {
  return async (req, account, raw) => {
    const input = DocumentInput.safeParse(raw)
    if (!input.success) return err({ code: 'not-found' })
    const { kind, id } = input.data
    const ids = await ownPersonIds(req, account)

    if (kind === 'certificate') {
      const [certificate] = await findOwnCertificates(req, ids, {
        select: { certificateId: true, status: true, pdfKey: true, pdfSha256: true },
        where: { id: { equals: id } },
        limit: 1,
      })
      if (!certificate) return err({ code: 'not-found' })
      // A revoked certificate has no download (docs/20 §7.3).
      if (certificate.status !== 'valid' || !certificate.pdfKey || !isPdfKey(certificate.pdfKey)) {
        return err({ code: 'not-available' })
      }
      const store = files.certificates()
      if (!store.ok) return err({ code: 'storage-missing' })
      const pdf = await store.value.get(certificate.pdfKey)
      if (!pdf || (certificate.pdfSha256 && sha256Hex(pdf) !== certificate.pdfSha256)) {
        return err({ code: 'not-available' })
      }
      await audit(req, 'download-certificate', 'certificates', certificate.id, account.accountId)
      return ok({ pdf, filename: `${certificate.certificateId}.pdf` })
    }

    const [invoice] = await findOwnInvoices(req, ids, {
      select: { number: true, status: true, pdfKey: true },
      where: { id: { equals: id } },
      limit: 1,
    })
    if (!invoice) return err({ code: 'not-found' })
    // No invoice PDF in My IIIC while prices are hidden (D-118).
    if (!(await readFlags(req.payload, req)).pricesPublic) return err({ code: 'prices-hidden' })
    if (invoice.status !== 'issued' || !isInvoicePdfKey(invoice.pdfKey)) {
      return err({ code: 'not-available' })
    }
    const store = files.invoices()
    if (!store) return err({ code: 'storage-missing' })
    const pdf = await store.get(invoice.pdfKey)
    if (!pdf) return err({ code: 'not-available' })
    await audit(req, 'download-invoice', 'invoices', invoice.id, account.accountId)
    return ok({ pdf, filename: invoiceFilename(invoice.number, invoice.id) })
  }
}

/** The download's audit entry, in the account's name and never an address (docs/20 §8). */
function audit(
  req: PayloadRequest,
  action: 'download-certificate' | 'download-invoice',
  entity: 'certificates' | 'invoices',
  entityId: number,
  accountId: number,
): Promise<void> {
  return recordAudit(req, { action, entity, entityId }, accountActor({ accountId }))
}

/** What the PDF routes send besides the file: never cached, never indexed, no referrer. */
export const DOCUMENT_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
} as const

/**
 * A download's answer: the PDF as an attachment; a 404 for a document that is not the account's,
 * not available (revoked, no PDF) or, for an invoice, while prices are hidden, so none of these
 * says more than "not here"; a 503 where the private store is not set up.
 */
export function documentResponse(result: Awaited<ReturnType<DownloadOwnDocument>>): Response {
  if (result.ok) {
    return new Response(Buffer.from(result.value.pdf), {
      status: 200,
      headers: {
        ...DOCUMENT_HEADERS,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${result.value.filename}"`,
      },
    })
  }
  const status = result.error.code === 'storage-missing' ? 503 : 404
  return new Response(status === 503 ? 'Not available here' : 'Not found', {
    status,
    headers: DOCUMENT_HEADERS,
  })
}

/** A document id from the address: a whole positive number, else nothing is looked up. */
export function documentId(raw: string): number {
  return /^\d{1,10}$/.test(raw) ? Number(raw) : 0
}

/** This deployment's stores (src/lib/certificates/store.ts, src/lib/invoicing/store.ts). */
export const downloadOwnDocument: DownloadOwnDocument = downloadOwnDocumentWith({
  certificates: () => certificateStoreFor(env()),
  invoices: () => invoiceFilesFor(env()),
})
