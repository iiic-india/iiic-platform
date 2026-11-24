import { splitInclusive } from '@/lib/payments/tax'
import { err, ok, type Result } from '@/lib/result'

import type { ZohoBooks, ZohoDocumentInput, ZohoError, ZohoIssued, ZohoPaymentInput } from './books'

/**
 * Zoho Books in memory, for tests and local development (docs/16 §11). It keeps documents by our
 * reference as Zoho does, so a retry finds the first attempt's document; works out tax from the
 * all-in amounts with the platform's own split, as Zoho should; and can be told to fail the next
 * call or to disagree about the tax by some paise, to prove the job notices. Every number it
 * issues says FAKE.
 */
export class FakeZohoBooks implements ZohoBooks {
  readonly invoices = new Map<string, ZohoIssued & { input: ZohoDocumentInput }>()
  readonly creditNotes = new Map<
    string,
    ZohoIssued & { input: ZohoDocumentInput & { invoiceId: string } }
  >()
  readonly payments = new Map<string, ZohoPaymentInput & { paymentId: string }>()
  readonly customers = new Map<string, string>()
  /** Every call, by method name, in order. */
  readonly calls: string[] = []

  /** The next call answers with this error instead. */
  failNext: ZohoError | null = null
  /** Paise added to the tax of every document made from now on. */
  taxSkewPaise = 0

  private serial = 0

  private take(method: string): ZohoError | null {
    this.calls.push(method)
    const failure = this.failNext
    this.failNext = null
    return failure
  }

  private issue(input: ZohoDocumentInput, prefix: string): ZohoIssued {
    const customerId =
      this.customers.get(input.customer.key) ?? `fake-customer-${this.customers.size + 1}`
    this.customers.set(input.customer.key, customerId)
    this.serial += 1
    const totalPaise = input.lines.reduce((sum, line) => sum + line.totalPaise, 0)
    const taxPaise = input.lines.reduce(
      (sum, line) => sum + splitInclusive(line.totalPaise, line.rate).taxPaise,
      this.taxSkewPaise,
    )
    return {
      zohoId: `fake-${prefix.toLowerCase()}-${this.serial}`,
      number: `FAKE-${prefix}-${String(this.serial).padStart(5, '0')}`,
      customerId,
      date: input.date,
      dueDate: prefix === 'INV' ? input.date : null,
      paymentTerms: prefix === 'INV' ? 'Fake terms: due on receipt' : null,
      totalPaise,
      taxPaise,
      reverseCharge: false,
    }
  }

  async issueInvoice(input: ZohoDocumentInput): Promise<Result<ZohoIssued, ZohoError>> {
    const failure = this.take('issueInvoice')
    if (failure) return err(failure)
    const existing = this.invoices.get(input.reference)
    if (existing) return ok(existing)
    const issued = { ...this.issue(input, 'INV'), input }
    this.invoices.set(input.reference, issued)
    return ok(issued)
  }

  async recordPayment(input: ZohoPaymentInput): Promise<Result<{ paymentId: string }, ZohoError>> {
    const failure = this.take('recordPayment')
    if (failure) return err(failure)
    const existing = this.payments.get(input.reference)
    if (existing) return ok({ paymentId: existing.paymentId })
    const paymentId = `fake-payment-${this.payments.size + 1}`
    this.payments.set(input.reference, { ...input, paymentId })
    return ok({ paymentId })
  }

  async issueCreditNote(
    input: ZohoDocumentInput & { invoiceId: string },
  ): Promise<Result<ZohoIssued, ZohoError>> {
    const failure = this.take('issueCreditNote')
    if (failure) return err(failure)
    const existing = this.creditNotes.get(input.reference)
    if (existing) return ok(existing)
    const issued = { ...this.issue(input, 'CN'), input }
    this.creditNotes.set(input.reference, issued)
    return ok(issued)
  }
}
