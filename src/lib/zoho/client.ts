import 'server-only'

import { z } from 'zod'

import type { Paise } from '@/lib/payments/money'
import { err, ok, type Result } from '@/lib/result'

import type {
  ZohoBooks,
  ZohoCustomer,
  ZohoDocumentInput,
  ZohoError,
  ZohoIssued,
  ZohoLine,
  ZohoPaymentInput,
} from './books'
import type { ZohoConfig } from './config'

/**
 * The Zoho Books API v3 client (D-13), India data centre by default. OAuth with the refresh token
 * from the environment: an access token is asked for when first needed and again when it is
 * about to end or Zoho refuses it, and kept in memory only. Every answer is read with Zod and only
 * the fields the platform uses leave this file. Requests carry the buyer's name, GSTIN and the
 * service as the document needs them, nothing else: no contact detail, no note, nothing said in
 * a session (CLAUDE.md #3). Errors carry Zoho's numeric code, never its message.
 */

type Fetch = typeof fetch

const TIMEOUT_MS = 20_000
/** Refresh a little before Zoho's hour is up. */
const EARLY_MS = 5 * 60 * 1000

/** Paise to the rupees Zoho reads; exact to the paise in JSON. */
export function toRupees(paise: Paise): number {
  return paise / 100
}

/** Rupees from Zoho to whole paise; Zoho keeps two decimals. */
export function toPaise(rupees: number): Paise {
  return Math.round(rupees * 100)
}

const Token = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() })

const Envelope = z.object({ code: z.number(), message: z.string().optional() })

const Id = z.union([z.string(), z.number()]).transform(String)
const Money = z.number().finite().nonnegative()

const Contact = z.object({ contact_id: Id, contact_name: z.string() })

const Tax = z.object({
  tax_id: Id,
  tax_percentage: z.number(),
  tax_type: z.string(),
  tax_specific_type: z.string().optional().nullable(),
})

const Reference = z.string().optional().nullable()

const InvoiceRows = z.object({
  invoices: z.array(z.object({ invoice_id: Id, reference_number: Reference })),
})

const CreditNoteRows = z.object({
  creditnotes: z.array(z.object({ creditnote_id: Id, reference_number: Reference })),
})

const InvoiceDetail = z.object({
  invoice_id: Id,
  invoice_number: z.string(),
  customer_id: Id,
  status: z.string(),
  date: z.string(),
  due_date: z.string().optional().nullable(),
  payment_terms_label: z.string().optional().nullable(),
  total: Money,
  tax_total: Money.optional(),
  is_reverse_charge_applied: z.boolean().optional(),
})

const CreditNoteDetail = z.object({
  creditnote_id: Id,
  creditnote_number: z.string(),
  customer_id: Id,
  status: z.string(),
  date: z.string(),
  total: Money,
  tax_total: Money.optional(),
  is_reverse_charge_applied: z.boolean().optional(),
})

const Payment = z.object({ payment_id: Id, reference_number: z.string().optional().nullable() })

type Query = Record<string, string>

/** Zoho's tax total in paise; a document without one cannot be held against ours. */
const taxOf = (taxTotal: number | undefined) => (taxTotal === undefined ? null : toPaise(taxTotal))

export class ZohoBooksClient implements ZohoBooks {
  private token: { value: string; until: number } | null = null
  private taxes: z.infer<typeof Tax>[] | null = null

  constructor(
    private readonly config: ZohoConfig,
    private readonly fetchImpl: Fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private async accessToken(force: boolean): Promise<Result<string, ZohoError>> {
    if (!force && this.token && this.token.until > this.now()) return ok(this.token.value)
    const body = new URLSearchParams({
      refresh_token: this.config.refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'refresh_token',
    })
    let response: Response
    try {
      response = await this.fetchImpl(`${this.config.accountsBase}/oauth/v2/token`, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      return err({ code: 'unavailable' })
    }
    if (response.status >= 500 || response.status === 429) return err({ code: 'unavailable' })
    // Zoho answers a refused refresh token with 200 and an `error` field.
    const parsed = Token.safeParse(await response.json().catch(() => null))
    if (!parsed.success) return err({ code: 'unauthorized' })
    this.token = {
      value: parsed.data.access_token,
      until: this.now() + parsed.data.expires_in * 1000 - EARLY_MS,
    }
    return ok(this.token.value)
  }

  /** One call to the Books API, with the organisation and a fresh token. */
  private async call<T extends z.ZodType>(
    method: 'GET' | 'POST',
    path: string,
    shape: T,
    { query = {}, body }: { query?: Query; body?: unknown } = {},
    retried = false,
  ): Promise<Result<z.infer<T>, ZohoError>> {
    const token = await this.accessToken(retried)
    if (!token.ok) return token
    const url = new URL(`${this.config.apiBase}${path}`)
    url.searchParams.set('organization_id', this.config.organizationId)
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value)
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Zoho-oauthtoken ${token.value}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      return err({ code: 'unavailable' })
    }
    if (response.status === 401 && !retried)
      return this.call(method, path, shape, { query, body }, true)
    if (response.status === 401) return err({ code: 'unauthorized' })
    if (response.status >= 500 || response.status === 429) return err({ code: 'unavailable' })
    const json: unknown = await response.json().catch(() => null)
    const envelope = Envelope.safeParse(json)
    if (!envelope.success) return err({ code: 'bad-answer' })
    if (envelope.data.code !== 0 || !response.ok) {
      return err({ code: 'refused', zohoCode: envelope.data.code })
    }
    const parsed = shape.safeParse(json)
    return parsed.success ? ok(parsed.data) : err({ code: 'bad-answer' })
  }

  /** The customer, found by its display name or made: `<name> · <key>`, unique in Zoho. */
  private async customer(customer: ZohoCustomer): Promise<Result<string, ZohoError>> {
    const displayName = `${customer.name} · ${customer.key}`.slice(0, 200)
    const found = await this.call('GET', '/contacts', z.object({ contacts: z.array(Contact) }), {
      query: { contact_name: displayName },
    })
    if (!found.ok) return found
    const match = found.value.contacts.find((contact) => contact.contact_name === displayName)
    if (match) return ok(match.contact_id)
    const made = await this.call('POST', '/contacts', z.object({ contact: Contact }), {
      body: {
        contact_name: displayName,
        contact_type: 'customer',
        gst_treatment: customer.gstin ? 'business_gst' : 'consumer',
        ...(customer.gstin ? { gst_no: customer.gstin } : {}),
      },
    })
    return made.ok ? ok(made.value.contact.contact_id) : made
  }

  /**
   * The Zoho tax for a rate: within a state the GST group (CGST and SGST together), between
   * states the IGST tax. The accountant sets these up in Zoho Books; none matching is an answer.
   */
  private async taxFor(line: ZohoLine, interState: boolean): Promise<Result<string, ZohoError>> {
    if (!this.taxes) {
      const listed = await this.call('GET', '/settings/taxes', z.object({ taxes: z.array(Tax) }))
      if (!listed.ok) return listed
      this.taxes = listed.value.taxes
    }
    const percentage = line.rate / 100
    const tax = this.taxes.find(
      (candidate) =>
        Math.abs(candidate.tax_percentage - percentage) < 1e-9 &&
        (interState
          ? candidate.tax_type === 'tax' && candidate.tax_specific_type === 'igst'
          : candidate.tax_type === 'tax_group'),
    )
    if (tax) return ok(tax.tax_id)
    // The list is read again next time, so a tax the accountant adds is found without a restart.
    this.taxes = null
    return err({ code: 'tax-missing' })
  }

  private async lineItems(
    input: ZohoDocumentInput,
    extra: Record<string, string> = {},
  ): Promise<Result<Record<string, unknown>[], ZohoError>> {
    const items: Record<string, unknown>[] = []
    for (const line of input.lines) {
      const tax = await this.taxFor(line, input.interState)
      if (!tax.ok) return tax
      items.push({
        name: line.description.slice(0, 100),
        description: line.description,
        product_type: 'services',
        ...(line.sacCode ? { hsn_or_sac: line.sacCode } : {}),
        quantity: line.quantity,
        rate: toRupees(Math.round(line.totalPaise / line.quantity)),
        tax_id: tax.value,
        ...extra,
      })
    }
    return ok(items)
  }

  /** Finds a document an earlier attempt made, by our reference (Zoho's filter, then exactly). */
  private async findByReference(
    kind: 'invoice' | 'creditnote',
    reference: string,
  ): Promise<Result<string | null, ZohoError>> {
    const found =
      kind === 'invoice'
        ? await this.call('GET', '/invoices', InvoiceRows, {
            query: { reference_number: reference },
          })
        : await this.call('GET', '/creditnotes', CreditNoteRows, {
            query: { reference_number: reference },
          })
    if (!found.ok) return found
    const rows: { id: string; reference_number?: string | null }[] =
      'invoices' in found.value
        ? found.value.invoices.map((row) => ({ ...row, id: row.invoice_id }))
        : found.value.creditnotes.map((row) => ({ ...row, id: row.creditnote_id }))
    return ok(rows.find((row) => row.reference_number === reference)?.id ?? null)
  }

  async issueInvoice(input: ZohoDocumentInput): Promise<Result<ZohoIssued, ZohoError>> {
    const existing = await this.findByReference('invoice', input.reference)
    if (!existing.ok) return existing
    let id = existing.value
    if (!id) {
      const customerId = await this.customer(input.customer)
      if (!customerId.ok) return customerId
      const items = await this.lineItems(input)
      if (!items.ok) return items
      const made = await this.call('POST', '/invoices', z.object({ invoice: InvoiceDetail }), {
        body: {
          customer_id: customerId.value,
          reference_number: input.reference,
          date: input.date,
          is_inclusive_tax: true,
          gst_treatment: input.customer.gstin ? 'business_gst' : 'consumer',
          ...(input.customer.gstin ? { gst_no: input.customer.gstin } : {}),
          line_items: items.value,
        },
      })
      if (!made.ok) return made
      id = made.value.invoice.invoice_id
    }
    const read = await this.call('GET', `/invoices/${id}`, z.object({ invoice: InvoiceDetail }))
    if (!read.ok) return read
    const invoice = read.value.invoice
    if (invoice.status === 'draft') {
      // Sent marks it open in Zoho so a payment can be applied; Zoho emails no one.
      const sent = await this.call('POST', `/invoices/${id}/status/sent`, Envelope)
      if (!sent.ok) return sent
    }
    const tax = taxOf(invoice.tax_total)
    if (tax === null) return err({ code: 'bad-answer' })
    return ok({
      zohoId: invoice.invoice_id,
      number: invoice.invoice_number,
      customerId: invoice.customer_id,
      date: invoice.date,
      dueDate: invoice.due_date ?? null,
      paymentTerms: invoice.payment_terms_label ?? null,
      totalPaise: toPaise(invoice.total),
      taxPaise: tax,
      reverseCharge: invoice.is_reverse_charge_applied ?? false,
    })
  }

  async recordPayment(input: ZohoPaymentInput): Promise<Result<{ paymentId: string }, ZohoError>> {
    const found = await this.call(
      'GET',
      '/customerpayments',
      z.object({ customerpayments: z.array(Payment) }),
      { query: { reference_number: input.reference } },
    )
    if (!found.ok) return found
    const match = found.value.customerpayments.find(
      (payment) => payment.reference_number === input.reference,
    )
    if (match) return ok({ paymentId: match.payment_id })
    const made = await this.call('POST', '/customerpayments', z.object({ payment: Payment }), {
      body: {
        customer_id: input.customerId,
        payment_mode: 'Razorpay',
        amount: toRupees(input.amountPaise),
        date: input.date,
        reference_number: input.reference,
        invoices: [{ invoice_id: input.invoiceId, amount_applied: toRupees(input.amountPaise) }],
      },
    })
    return made.ok ? ok({ paymentId: made.value.payment.payment_id }) : made
  }

  async issueCreditNote(
    input: ZohoDocumentInput & { invoiceId: string },
  ): Promise<Result<ZohoIssued, ZohoError>> {
    const existing = await this.findByReference('creditnote', input.reference)
    if (!existing.ok) return existing
    let id = existing.value
    if (!id) {
      const customerId = await this.customer(input.customer)
      if (!customerId.ok) return customerId
      const items = await this.lineItems(input, { invoice_id: input.invoiceId })
      if (!items.ok) return items
      const made = await this.call(
        'POST',
        '/creditnotes',
        z.object({ creditnote: CreditNoteDetail }),
        {
          body: {
            customer_id: customerId.value,
            reference_number: input.reference,
            reference_invoice_id: input.invoiceId,
            date: input.date,
            is_inclusive_tax: true,
            gst_treatment: input.customer.gstin ? 'business_gst' : 'consumer',
            ...(input.customer.gstin ? { gst_no: input.customer.gstin } : {}),
            line_items: items.value,
          },
        },
      )
      if (!made.ok) return made
      id = made.value.creditnote.creditnote_id
    }
    const read = await this.call(
      'GET',
      `/creditnotes/${id}`,
      z.object({ creditnote: CreditNoteDetail }),
    )
    if (!read.ok) return read
    const note = read.value.creditnote
    if (note.status === 'draft') {
      const opened = await this.call('POST', `/creditnotes/${id}/status/open`, Envelope)
      if (!opened.ok) return opened
    }
    const tax = taxOf(note.tax_total)
    if (tax === null) return err({ code: 'bad-answer' })
    return ok({
      zohoId: note.creditnote_id,
      number: note.creditnote_number,
      customerId: note.customer_id,
      date: note.date,
      dueDate: null,
      paymentTerms: null,
      totalPaise: toPaise(note.total),
      taxPaise: tax,
      reverseCharge: note.is_reverse_charge_applied ?? false,
    })
  }
}
