import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import { type ViewRefusal, viewRefusal } from '@/access/views'
import { recordAudit } from '@/lib/audit/record'
import { err, ok, type Result } from '@/lib/result'

import { type InvoiceFiles, isInvoicePdfKey } from './store'

/**
 * A client's invoice or credit-note PDF for the office (D-88; M7): finance and owners, signed in
 * with the two-factor code, checked before anything is read (CLAUDE.md #6, `VIEW_POLICY`). The
 * document is read with the user's own access, its PDF from the private bucket, and the download
 * is written to the audit log as `download-invoice` before the file is sent. Nothing about the
 * client is logged; the answer names the document by Zoho's number only.
 */

export type InvoiceDownloadError =
  | { code: 'refused'; refusal: ViewRefusal }
  | { code: 'invalid' }
  | { code: 'not-found' }
  | { code: 'no-pdf' }
  | { code: 'storage-missing' }

export const INVOICE_DOWNLOAD_ANSWERS: Record<
  Exclude<InvoiceDownloadError['code'], 'refused'> | ViewRefusal['code'],
  string
> = {
  'sign-in': 'Sign in again to continue.',
  'enter-code': 'Enter your two-factor code first.',
  'not-allowed': 'Your role cannot do this.',
  invalid: 'That is not an invoice in the list.',
  'not-found': 'That invoice is no longer here. Reload the list.',
  'no-pdf':
    'This invoice has no PDF of its own yet. Zoho Books holds the issued copy; the PDF is made once every detail it prints is supplied.',
  'storage-missing':
    'PDFs cannot be opened on this deployment: its private documents bucket is not set up.',
}

const InvoiceId = z.coerce.number().int().positive().max(2_147_483_647)

/** A filename a browser keeps as it is: Zoho's number, letters, digits and dashes only. */
export function invoiceFilename(number: string | null | undefined, id: number): string {
  const safe = (number ?? '')
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${safe || `invoice-${id}`}.pdf`
}

export async function downloadInvoicePdf(
  req: PayloadRequest,
  rawId: unknown,
  files: InvoiceFiles | null,
): Promise<Result<{ pdf: Uint8Array; filename: string }, InvoiceDownloadError>> {
  const refusal = viewRefusal(req.user, 'invoicePdf')
  if (refusal) return err({ code: 'refused', refusal })
  const id = InvoiceId.safeParse(rawId)
  if (!id.success) return err({ code: 'invalid' })
  const invoice = await req.payload.findByID({
    collection: 'invoices',
    id: id.data,
    depth: 0,
    select: { number: true, pdfKey: true },
    disableErrors: true,
    overrideAccess: false,
    req,
  })
  if (!invoice) return err({ code: 'not-found' })
  if (!isInvoicePdfKey(invoice.pdfKey)) return err({ code: 'no-pdf' })
  if (!files) return err({ code: 'storage-missing' })
  const pdf = await files.get(invoice.pdfKey)
  if (!pdf) return err({ code: 'no-pdf' })
  await recordAudit(req, { action: 'download-invoice', entity: 'invoices', entityId: invoice.id })
  return ok({ pdf, filename: invoiceFilename(invoice.number, invoice.id) })
}

/** The HTTP status for each refusal. */
export function statusOf(error: InvoiceDownloadError): number {
  switch (error.code) {
    case 'refused':
      return error.refusal.status
    case 'invalid':
      return 400
    case 'not-found':
    case 'no-pdf':
      return 404
    case 'storage-missing':
      return 503
  }
}

export function messageOf(error: InvoiceDownloadError): string {
  return INVOICE_DOWNLOAD_ANSWERS[error.code === 'refused' ? error.refusal.code : error.code]
}
