import type { BasisPoints, Paise } from '@/lib/payments/money'
import type { Result } from '@/lib/result'

/**
 * Zoho Books as the platform uses it (D-13; docs/07, Invoicing): the system of record for GST
 * documents, which numbers them and keeps them for the accountant. The platform asks for three
 * things, each idempotent by a reference of its own, so a retried job finds what an earlier
 * attempt made instead of making it twice:
 *
 * - a tax invoice for a captured payment (B3), marked sent so a payment can be applied to it;
 * - the payment recorded against it (B3), by the gateway's payment id;
 * - a credit note against the invoice when money goes back (the credit note on a refund).
 *
 * Amounts cross this boundary in paise and are converted to rupees only in the HTTP client.
 * Totals come back as Zoho computed them, for the caller to hold against its own (a mismatch
 * fails the job, docs/16 §5). The real client is src/lib/zoho/client.ts; tests use the fake.
 */

export type ZohoError =
  | { code: 'not-configured'; reason: 'missing' | 'not-production' }
  /** No answer, a server error or a rate limit: try again later. */
  | { code: 'unavailable' }
  /** The refresh token was refused: an owner reconnects Zoho Books. */
  | { code: 'unauthorized' }
  /** Zoho refused the request; its own error code, never its message (it may quote data). */
  | { code: 'refused'; zohoCode: number }
  /** No tax in Zoho Books matches the document's GST rate (set up by the accountant). */
  | { code: 'tax-missing' }
  /** An answer this client cannot read. */
  | { code: 'bad-answer' }

export type ZohoCustomer = {
  /** The name as it should print. */
  name: string
  /** A short platform id that keeps two people of one name apart in Zoho (`P-12`). */
  key: string
  gstin: string | null
}

export type ZohoLine = {
  description: string
  sacCode: string | null
  quantity: number
  /** The line's all-in amount for its whole quantity. */
  totalPaise: Paise
  rate: BasisPoints
}

export type ZohoDocumentInput = {
  /** Our reference, unique per document: Zoho finds an earlier attempt by it. */
  reference: string
  /** YYYY-MM-DD, in India. */
  date: string
  customer: ZohoCustomer
  lines: ZohoLine[]
  /** The buyer is in another state: IGST rather than CGST and SGST. */
  interState: boolean
}

export type ZohoIssued = {
  zohoId: string
  number: string
  customerId: string
  /** YYYY-MM-DD. */
  date: string
  dueDate: string | null
  paymentTerms: string | null
  totalPaise: Paise
  taxPaise: Paise
  reverseCharge: boolean
}

export type ZohoPaymentInput = {
  /** The gateway's payment id: one payment record per captured payment. */
  reference: string
  customerId: string
  invoiceId: string
  amountPaise: Paise
  date: string
}

export interface ZohoBooks {
  issueInvoice(input: ZohoDocumentInput): Promise<Result<ZohoIssued, ZohoError>>
  recordPayment(input: ZohoPaymentInput): Promise<Result<{ paymentId: string }, ZohoError>>
  issueCreditNote(
    input: ZohoDocumentInput & { invoiceId: string },
  ): Promise<Result<ZohoIssued, ZohoError>>
}

/** Errors worth another attempt: the job throws on these so Payload retries it. */
export function isPassing(error: ZohoError): boolean {
  return error.code === 'unavailable'
}
