import 'server-only'

import type { PayloadRequest } from 'payload'

import { emitAutomationEvent } from '@/lib/automations/emit'
import { env } from '@/lib/env'
import { renderInvoicePdf } from '@/lib/pdf/documents'
import { err, ok, type Result } from '@/lib/result'
import type { ZohoBooks, ZohoError } from '@/lib/zoho/books'
import { ZohoBooksClient } from '@/lib/zoho/client'
import { zohoConfig } from '@/lib/zoho/config'

import type { DocumentsDeps } from './deps'
import { issueCreditNoteForRefund, issueInvoiceForPayment, type DocumentOutcome } from './issue'

/**
 * The documents module this server runs with: Zoho Books when src/lib/env.ts holds its four
 * settings and this is not a preview (src/lib/zoho/config.ts), the PDF renderer with the
 * serverless Chromium on Vercel, and no PDF store yet: the private bucket's name is not among the
 * validated settings, so the client's PDF is not made and Zoho's own copy stands until it is
 * (proposed in the slice's report). One Zoho client per server, so its access token is reused.
 */

let zoho: Result<ZohoBooks, ZohoError> | undefined

function zohoBooks(): Result<ZohoBooks, ZohoError> {
  if (zoho) return zoho
  const config = zohoConfig(env())
  zoho = config.ok ? ok(new ZohoBooksClient(config.value)) : err(config.error)
  return zoho
}

export function documentsDeps(): DocumentsDeps {
  return {
    zoho: zohoBooks,
    store: null,
    renderPdf: (doc) => renderInvoicePdf(doc, { serverless: Boolean(env().VERCEL_ENV) }),
    now: () => new Date(),
  }
}

/**
 * B3's email (M6, docs/19 §5): once Zoho Books has issued the tax invoice, `invoice.issued` queues
 * `B3-receipt` with the document's and the booking's ids. Raised again when a later run finds the
 * invoice already issued; the receipt is one message per invoice, so it is still sent once.
 */
async function announceIssued(req: PayloadRequest, outcome: DocumentOutcome): Promise<void> {
  if (outcome.outcome !== 'issued' && outcome.outcome !== 'already-issued') return
  if (!outcome.invoiceId) return
  const invoice = await req.payload.findByID({
    collection: 'invoices',
    id: outcome.invoiceId,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
    req,
  })
  const bookingId =
    typeof invoice?.booking === 'object' ? invoice.booking?.id : (invoice?.booking ?? null)
  if (!invoice || invoice.status !== 'issued' || !bookingId) return
  await emitAutomationEvent(req, { name: 'invoice.issued', invoiceId: invoice.id, bookingId })
}

export const issueInvoice = async (req: PayloadRequest, input: { paymentId: number }) => {
  const result = await issueInvoiceForPayment(documentsDeps(), req, input)
  if (result.ok) await announceIssued(req, result.value)
  return result
}

export const issueCreditNote = (req: PayloadRequest, input: { refundId: number }) =>
  issueCreditNoteForRefund(documentsDeps(), req, input)
