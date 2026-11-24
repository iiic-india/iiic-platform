import 'server-only'

import type { PayloadRequest } from 'payload'

import { env } from '@/lib/env'
import { renderInvoicePdf } from '@/lib/pdf/documents'
import { err, ok, type Result } from '@/lib/result'
import type { ZohoBooks, ZohoError } from '@/lib/zoho/books'
import { ZohoBooksClient } from '@/lib/zoho/client'
import { zohoConfig } from '@/lib/zoho/config'

import type { DocumentsDeps } from './deps'
import { issueCreditNoteForRefund, issueInvoiceForPayment } from './issue'

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

export const issueInvoice = (req: PayloadRequest, input: { paymentId: number }) =>
  issueInvoiceForPayment(documentsDeps(), req, input)

export const issueCreditNote = (req: PayloadRequest, input: { refundId: number }) =>
  issueCreditNoteForRefund(documentsDeps(), req, input)
