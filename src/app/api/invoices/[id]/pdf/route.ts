import { createPayloadRequest } from 'payload'

import { viewRefusal } from '@/access/views'
import { env } from '@/lib/env'
import {
  downloadInvoicePdf,
  messageOf,
  statusOf,
  type InvoiceDownloadError,
} from '@/lib/invoicing/download'
import { invoiceFilesFor } from '@/lib/invoicing/store'
import { answeringFaults } from '@/lib/monitoring/routeFaults'
import config from '@payload-config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
} as const

const refusal = (error: InvoiceDownloadError) =>
  Response.json(
    { code: error.code === 'refused' ? error.refusal.code : error.code, message: messageOf(error) },
    { status: statusOf(error), headers: PRIVATE_HEADERS },
  )

/**
 * GET /api/invoices/<id>/pdf (D-88; M7): a client's invoice or credit-note PDF from the private
 * bucket, for owners and finance signed in with the code. The request is made into a Payload
 * request first, so the two-factor strategy runs, and the user and role are checked before the
 * invoice is read; the download is written to the audit log before it is sent
 * (src/lib/invoicing/download.ts).
 */
async function get(request: Request, context: { params: Promise<{ id: string }> }) {
  const req = await createPayloadRequest({ config, request })
  // The user, the code and the role before the address's id is read (CLAUDE.md #6).
  const refused = viewRefusal(req.user, 'invoicePdf')
  if (refused) return refusal({ code: 'refused', refusal: refused })
  const { id } = await context.params
  const file = await downloadInvoicePdf(req, id, invoiceFilesFor(env()))
  if (!file.ok) return refusal(file.error)
  return new Response(Buffer.from(file.value.pdf), {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${file.value.filename}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export const GET = answeringFaults('Downloading an invoice', get)
