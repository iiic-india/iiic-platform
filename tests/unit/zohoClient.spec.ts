// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import type { ZohoDocumentInput } from '@/lib/zoho/books'
import { ZohoBooksClient, toPaise, toRupees } from '@/lib/zoho/client'
import { accountsBaseFor, zohoConfig, type ZohoConfig } from '@/lib/zoho/config'
import { FakeZohoBooks } from '@/lib/zoho/fake'

vi.mock('server-only', () => ({}))

// The Zoho Books client (D-13) against a scripted Zoho: OAuth refresh, Zod at the boundary,
// documents found by our reference before any is made, and errors as codes. Every id, name,
// token and amount here is fake.

const CONFIG: ZohoConfig = {
  organizationId: 'fake-org',
  clientId: 'fake-client',
  clientSecret: 'fake-secret',
  refreshToken: 'fake-refresh',
  apiBase: 'https://www.zohoapis.in/books/v3',
  accountsBase: 'https://accounts.zoho.in',
}

const INPUT: ZohoDocumentInput = {
  reference: 'IIIC-S-00000/1',
  date: '2026-11-20',
  customer: { name: 'Fake Buyer', key: 'P-1', gstin: null },
  lines: [
    {
      description: 'Fake session',
      sacCode: '999999',
      quantity: 1,
      totalPaise: 118_000,
      rate: 1800,
    },
  ],
  interState: false,
}

type Route = (url: URL, init: RequestInit) => { status?: number; body: unknown } | undefined

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** A scripted Zoho: the token endpoint, then the routes in order of matching. */
function scripted(
  routes: Route[],
  token: unknown = { access_token: 'fake-token', expires_in: 3600 },
) {
  const seen: { method: string; url: URL; body: unknown; auth: string | null }[] = []
  const fetchImpl = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input))
    const method = init.method ?? 'GET'
    const headers = new Headers(init.headers)
    seen.push({
      method,
      url,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
      auth: headers.get('Authorization'),
    })
    if (url.pathname === '/oauth/v2/token') return json(token)
    for (const route of routes) {
      const answer = route(url, init)
      if (answer) return json(answer.body, answer.status ?? 200)
    }
    return json({ code: 9999, message: 'no route in the test' }, 404)
  })
  return { fetchImpl: fetchImpl as unknown as typeof fetch, seen }
}

const on =
  (method: string, path: string, body: unknown, status?: number): Route =>
  (url, init) =>
    (init.method ?? 'GET') === method && url.pathname === `/books/v3${path}`
      ? { body, ...(status ? { status } : {}) }
      : undefined

const INVOICE = {
  invoice_id: 11,
  invoice_number: 'FAKE-INV-1',
  customer_id: 21,
  status: 'draft',
  date: '2026-11-20',
  due_date: '2026-11-20',
  payment_terms_label: 'Fake terms',
  total: 1180,
  tax_total: 180,
}

const TAXES = {
  code: 0,
  taxes: [
    { tax_id: 'igst18', tax_percentage: 18, tax_type: 'tax', tax_specific_type: 'igst' },
    { tax_id: 'gst18', tax_percentage: 18, tax_type: 'tax_group', tax_specific_type: '' },
  ],
}

describe('money at the boundary', () => {
  it('turns paise into rupees and back without losing a paisa', () => {
    for (const paise of [0, 1, 5, 99, 118_000, 12_345_650, 100_000_001]) {
      expect(toPaise(toRupees(paise))).toBe(paise)
    }
  })
})

describe('zohoConfig', () => {
  const ENV = {
    ZOHO_BOOKS_ORGANIZATION_ID: 'fake-org',
    ZOHO_CLIENT_ID: 'fake-client',
    ZOHO_CLIENT_SECRET: 'fake-secret',
    ZOHO_REFRESH_TOKEN: 'fake-refresh',
    ZOHO_API_BASE: 'https://www.zohoapis.in/books/v3/',
    VERCEL_ENV: undefined,
  } as const

  it('takes all four settings or none', () => {
    expect(zohoConfig({ ...ENV, ZOHO_REFRESH_TOKEN: undefined })).toEqual({
      ok: false,
      error: { code: 'not-configured', reason: 'missing' },
    })
    const config = zohoConfig(ENV)
    expect(config.ok && config.value.apiBase).toBe('https://www.zohoapis.in/books/v3')
    expect(config.ok && config.value.accountsBase).toBe('https://accounts.zoho.in')
  })

  it('issues no real document from a preview, which shares production’s database', () => {
    expect(zohoConfig({ ...ENV, VERCEL_ENV: 'preview' })).toEqual({
      ok: false,
      error: { code: 'not-configured', reason: 'not-production' },
    })
    expect(zohoConfig({ ...ENV, VERCEL_ENV: 'production' }).ok).toBe(true)
  })

  it('refreshes tokens in the API’s own data centre', () => {
    expect(accountsBaseFor('https://www.zohoapis.in/books/v3')).toBe('https://accounts.zoho.in')
    expect(accountsBaseFor('https://www.zohoapis.com/books/v3')).toBe('https://accounts.zoho.com')
  })
})

describe('ZohoBooksClient.issueInvoice', () => {
  it('makes the customer and the invoice, marks it sent, and reads back Zoho’s totals', async () => {
    const { fetchImpl, seen } = scripted([
      on('GET', '/invoices', { code: 0, invoices: [] }),
      on('GET', '/contacts', { code: 0, contacts: [] }),
      on('POST', '/contacts', { code: 0, contact: { contact_id: 21, contact_name: 'x' } }),
      on('GET', '/settings/taxes', TAXES),
      on('POST', '/invoices', { code: 0, invoice: INVOICE }),
      on('GET', '/invoices/11', { code: 0, invoice: INVOICE }),
      on('POST', '/invoices/11/status/sent', { code: 0 }),
    ])
    const client = new ZohoBooksClient(CONFIG, fetchImpl)
    const issued = await client.issueInvoice(INPUT)
    expect(issued).toEqual({
      ok: true,
      value: {
        zohoId: '11',
        number: 'FAKE-INV-1',
        customerId: '21',
        date: '2026-11-20',
        dueDate: '2026-11-20',
        paymentTerms: 'Fake terms',
        totalPaise: 118_000,
        taxPaise: 18_000,
        reverseCharge: false,
      },
    })
    const calls = seen.filter((call) => call.url.pathname !== '/oauth/v2/token')
    expect(calls.every((call) => call.url.searchParams.get('organization_id') === 'fake-org')).toBe(
      true,
    )
    expect(calls.every((call) => call.auth === 'Zoho-oauthtoken fake-token')).toBe(true)
    const contact = calls.find(
      (call) => call.method === 'POST' && call.url.pathname.endsWith('/contacts'),
    )
    expect(contact?.body).toEqual({
      contact_name: 'Fake Buyer · P-1',
      contact_type: 'customer',
      gst_treatment: 'consumer',
    })
    const made = calls.find(
      (call) => call.method === 'POST' && call.url.pathname.endsWith('/invoices'),
    )
    expect(made?.body).toMatchObject({
      customer_id: '21',
      reference_number: 'IIIC-S-00000/1',
      is_inclusive_tax: true,
      line_items: [{ rate: 1180, quantity: 1, hsn_or_sac: '999999', tax_id: 'gst18' }],
    })
    // One token for the whole run.
    expect(seen.filter((call) => call.url.pathname === '/oauth/v2/token')).toHaveLength(1)
  })

  it('finds the invoice an earlier attempt made instead of making another', async () => {
    const { fetchImpl, seen } = scripted([
      on('GET', '/invoices', {
        code: 0,
        invoices: [
          { invoice_id: 10, reference_number: 'IIIC-S-00000/10' },
          { invoice_id: 11, reference_number: 'IIIC-S-00000/1' },
        ],
      }),
      on('GET', '/invoices/11', { code: 0, invoice: { ...INVOICE, status: 'sent' } }),
    ])
    const issued = await new ZohoBooksClient(CONFIG, fetchImpl).issueInvoice(INPUT)
    expect(issued.ok && issued.value.zohoId).toBe('11')
    expect(
      seen.some((call) => call.method === 'POST' && call.url.pathname !== '/oauth/v2/token'),
    ).toBe(false)
  })

  it('uses the IGST tax between states and refuses a rate Zoho has no tax for', async () => {
    const routes = [
      on('GET', '/invoices', { code: 0, invoices: [] }),
      on('GET', '/contacts', {
        code: 0,
        contacts: [{ contact_id: 21, contact_name: 'Fake Buyer · P-1' }],
      }),
      on('GET', '/settings/taxes', TAXES),
      on('POST', '/invoices', { code: 0, invoice: INVOICE }),
      on('GET', '/invoices/11', { code: 0, invoice: { ...INVOICE, status: 'sent' } }),
    ]
    const igst = scripted(routes)
    await new ZohoBooksClient(CONFIG, igst.fetchImpl).issueInvoice({ ...INPUT, interState: true })
    const made = igst.seen.find(
      (call) => call.method === 'POST' && call.url.pathname.endsWith('/invoices'),
    )
    expect(made?.body).toMatchObject({ line_items: [{ tax_id: 'igst18' }] })

    const none = scripted(routes)
    const refused = await new ZohoBooksClient(CONFIG, none.fetchImpl).issueInvoice({
      ...INPUT,
      lines: [{ ...INPUT.lines[0]!, rate: 500 }],
    })
    expect(refused).toEqual({ ok: false, error: { code: 'tax-missing' } })
  })

  it('answers an outage as unavailable, a refusal with Zoho’s code, and a strange answer as such', async () => {
    const down = scripted([on('GET', '/invoices', { code: 0 }, 503)])
    expect(await new ZohoBooksClient(CONFIG, down.fetchImpl).issueInvoice(INPUT)).toEqual({
      ok: false,
      error: { code: 'unavailable' },
    })
    const refused = scripted([
      on('GET', '/invoices', { code: 1002, message: 'Fake Buyer said no' }, 400),
    ])
    const answer = await new ZohoBooksClient(CONFIG, refused.fetchImpl).issueInvoice(INPUT)
    expect(answer).toEqual({ ok: false, error: { code: 'refused', zohoCode: 1002 } })
    // The message, which may quote data, never leaves the client.
    expect(JSON.stringify(answer)).not.toContain('Fake Buyer')
    const strange = scripted([on('GET', '/invoices', { code: 0, invoices: 'nope' })])
    expect(await new ZohoBooksClient(CONFIG, strange.fetchImpl).issueInvoice(INPUT)).toEqual({
      ok: false,
      error: { code: 'bad-answer' },
    })
    const offline = new ZohoBooksClient(CONFIG, (async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch)
    expect(await offline.issueInvoice(INPUT)).toEqual({ ok: false, error: { code: 'unavailable' } })
  })

  it('refreshes the token once when Zoho refuses it, and reports a refused refresh token', async () => {
    let first = true
    const { fetchImpl, seen } = scripted([
      (url) => {
        if (url.pathname !== '/books/v3/invoices') return undefined
        if (first) {
          first = false
          return { status: 401, body: { code: 57, message: 'expired' } }
        }
        return {
          body: { code: 0, invoices: [{ invoice_id: 11, reference_number: INPUT.reference }] },
        }
      },
      on('GET', '/invoices/11', { code: 0, invoice: { ...INVOICE, status: 'sent' } }),
    ])
    expect((await new ZohoBooksClient(CONFIG, fetchImpl).issueInvoice(INPUT)).ok).toBe(true)
    expect(seen.filter((call) => call.url.pathname === '/oauth/v2/token')).toHaveLength(2)

    const refusedToken = scripted([], { error: 'invalid_code' })
    expect(await new ZohoBooksClient(CONFIG, refusedToken.fetchImpl).issueInvoice(INPUT)).toEqual({
      ok: false,
      error: { code: 'unauthorized' },
    })
  })
})

describe('ZohoBooksClient.recordPayment and issueCreditNote', () => {
  it('records a payment once, by the gateway’s payment id', async () => {
    const payment = {
      reference: 'pay_FAKE1',
      customerId: '21',
      invoiceId: '11',
      amountPaise: 118_000,
      date: '2026-11-20',
    }
    const fresh = scripted([
      on('GET', '/customerpayments', { code: 0, customerpayments: [] }),
      on('POST', '/customerpayments', { code: 0, payment: { payment_id: 31 } }),
    ])
    expect(await new ZohoBooksClient(CONFIG, fresh.fetchImpl).recordPayment(payment)).toEqual({
      ok: true,
      value: { paymentId: '31' },
    })
    const made = fresh.seen.find(
      (call) => call.method === 'POST' && call.url.pathname.endsWith('/customerpayments'),
    )
    expect(made?.body).toMatchObject({
      amount: 1180,
      reference_number: 'pay_FAKE1',
      invoices: [{ invoice_id: '11', amount_applied: 1180 }],
    })
    const again = scripted([
      on('GET', '/customerpayments', {
        code: 0,
        customerpayments: [{ payment_id: 31, reference_number: 'pay_FAKE1' }],
      }),
    ])
    expect(await new ZohoBooksClient(CONFIG, again.fetchImpl).recordPayment(payment)).toEqual({
      ok: true,
      value: { paymentId: '31' },
    })
  })

  it('makes a credit note against the invoice and opens it', async () => {
    const NOTE = {
      creditnote_id: 41,
      creditnote_number: 'FAKE-CN-1',
      customer_id: 21,
      status: 'draft',
      date: '2026-11-21',
      total: 590,
      tax_total: 90,
    }
    const { fetchImpl, seen } = scripted([
      on('GET', '/creditnotes', { code: 0, creditnotes: [] }),
      on('GET', '/contacts', {
        code: 0,
        contacts: [{ contact_id: 21, contact_name: 'Fake Buyer · P-1' }],
      }),
      on('GET', '/settings/taxes', TAXES),
      on('POST', '/creditnotes', { code: 0, creditnote: NOTE }),
      on('GET', '/creditnotes/41', { code: 0, creditnote: NOTE }),
      on('POST', '/creditnotes/41/status/open', { code: 0 }),
    ])
    const note = await new ZohoBooksClient(CONFIG, fetchImpl).issueCreditNote({
      ...INPUT,
      reference: 'IIIC-S-00000/2',
      lines: [{ ...INPUT.lines[0]!, totalPaise: 59_000 }],
      invoiceId: '11',
    })
    expect(note.ok && note.value).toMatchObject({
      number: 'FAKE-CN-1',
      totalPaise: 59_000,
      taxPaise: 9_000,
    })
    const made = seen.find(
      (call) => call.method === 'POST' && call.url.pathname.endsWith('/creditnotes'),
    )
    expect(made?.body).toMatchObject({
      reference_invoice_id: '11',
      line_items: [{ invoice_id: '11', rate: 590 }],
    })
    expect(seen.some((call) => call.url.pathname.endsWith('/creditnotes/41/status/open'))).toBe(
      true,
    )
  })
})

describe('FakeZohoBooks', () => {
  it('keeps documents by reference and can fail or disagree on demand', async () => {
    const zoho = new FakeZohoBooks()
    const first = await zoho.issueInvoice(INPUT)
    const second = await zoho.issueInvoice(INPUT)
    expect(first.ok && second.ok && first.value.zohoId === second.value.zohoId).toBe(true)
    expect(first.ok && first.value.taxPaise).toBe(18_000)
    zoho.failNext = { code: 'unavailable' }
    expect(
      await zoho.recordPayment({
        reference: 'r',
        customerId: 'c',
        invoiceId: 'i',
        amountPaise: 1,
        date: '2026-11-20',
      }),
    ).toEqual({
      ok: false,
      error: { code: 'unavailable' },
    })
    zoho.taxSkewPaise = 1
    const skewed = await zoho.issueInvoice({ ...INPUT, reference: 'other' })
    expect(skewed.ok && skewed.value.taxPaise).toBe(18_001)
  })
})
