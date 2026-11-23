// @vitest-environment node
import type { PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ok } from '@/lib/result'

vi.mock('server-only', () => ({}))

const emitted = vi.hoisted(() => ({ emitAutomationEvent: vi.fn(async () => undefined) }))
vi.mock('@/lib/automations/emit', () => emitted)

const issue = vi.hoisted(() => ({
  issueInvoiceForPayment: vi.fn(),
  issueCreditNoteForRefund: vi.fn(),
}))
vi.mock('@/lib/invoicing/issue', () => issue)
vi.mock('@/lib/env', () => ({ env: () => ({}) }))
vi.mock('@/lib/pdf/documents', () => ({ renderInvoicePdf: vi.fn() }))
vi.mock('@/lib/zoho/client', () => ({ ZohoBooksClient: vi.fn() }))
vi.mock('@/lib/zoho/config', () => ({ zohoConfig: vi.fn() }))

const core = vi.hoisted(() => ({
  deliver: vi.fn(async () => ok({ messageId: 1, created: true, status: 'queued' as const })),
  cancelQueued: vi.fn(async () => 2),
  verifyLink: vi.fn(async () => ok({ subjectId: 9 })),
}))
vi.mock('@/lib/messaging/deliver', () => ({
  deliver: core.deliver,
  cancelQueued: core.cancelQueued,
}))
vi.mock('@/lib/messaging/links', () => ({ verifyLink: core.verifyLink }))

const { issueInvoice, issueCreditNote } = await import('@/lib/invoicing/wiring')
const port = await import('@/lib/automations/operations/core')
const { messagingCore } = await import('@/lib/automations/booking/wiring')
const { OFFICE_COPY } = await import('@/lib/office/copy')
const { attemptsOf, withFailurePath } = await import('@/lib/automations/failures')

// What the M6 join wires (docs/19 §12): the invoice job raises `invoice.issued` for B3's email;
// builder B's and builder C's automations reach builder A's core; every task fails visibly to O3;
// the office is told whether IIIC's message carries a payment link. Fake records only.

function invoiceReq(invoice: Record<string, unknown> | null) {
  return {
    payload: { findByID: vi.fn(async () => invoice) },
  } as unknown as PayloadRequest
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('the invoice job and B3', () => {
  it('raises invoice.issued with the invoice’s and the booking’s ids once Zoho has issued it', async () => {
    issue.issueInvoiceForPayment.mockResolvedValue(ok({ outcome: 'issued', invoiceId: 11 }))
    const req = invoiceReq({ id: 11, status: 'issued', booking: 5 })
    await issueInvoice(req, { paymentId: 3 })
    expect(emitted.emitAutomationEvent).toHaveBeenCalledWith(req, {
      name: 'invoice.issued',
      invoiceId: 11,
      bookingId: 5,
    })
  })

  it('raises nothing while the invoice waits, and nothing for a credit note', async () => {
    issue.issueInvoiceForPayment.mockResolvedValue(
      ok({ outcome: 'supplier-gstin-missing', invoiceId: 11 }),
    )
    await issueInvoice(invoiceReq({ id: 11, status: 'pending', booking: 5 }), { paymentId: 3 })
    issue.issueCreditNoteForRefund.mockResolvedValue(ok({ outcome: 'issued', invoiceId: 12 }))
    await issueCreditNote(invoiceReq({ id: 12, status: 'issued', booking: 5 }), { refundId: 4 })
    expect(emitted.emitAutomationEvent).not.toHaveBeenCalled()
  })
})

describe('the messaging core at the join', () => {
  const req = {} as PayloadRequest

  it('reaches A’s deliver, cancelQueued and verifyLink from builder C’s port by default', async () => {
    const planned = { automation: 'N2' } as never
    expect(await port.plan(req, planned)).toEqual(
      ok({ messageId: 1, created: true, status: 'queued' }),
    )
    expect(core.deliver).toHaveBeenCalledWith(req, planned)
    expect(await port.cancelPlanned(req, { subject: { collection: 'x', id: 1 } } as never)).toBe(2)
    expect(await port.verifySignedLink('withdraw', 'a.b.c')).toEqual(ok({ subjectId: 9 }))
    expect(port.hasMessagingCore()).toBe(true)
  })

  it('takes a test’s fake, or none, in its place', async () => {
    port.useMessagingCore(null)
    expect(port.hasMessagingCore()).toBe(false)
    expect(await port.plan(req, {} as never)).toEqual({
      ok: false,
      error: { code: 'core-missing' },
    })
    expect((await port.verifySignedLink('withdraw', 'a.b.c')).ok).toBe(false)
  })

  it('gives the B-series A’s deliver and cancelQueued', async () => {
    const found = await messagingCore()
    expect(found.ok && found.value.deliver).toBe(core.deliver)
    expect(found.ok && found.value.cancelQueued).toBe(core.cancelQueued)
  })
})

describe('the shared failure path', () => {
  it('reads the tries a task allows, and leaves a task’s own onFail alone', () => {
    expect(attemptsOf(3)).toBe(3)
    expect(attemptsOf({ attempts: 2 })).toBe(2)
    expect(attemptsOf(undefined)).toBe(0)
    const own = vi.fn()
    expect(withFailurePath({ slug: 'x', onFail: own }).onFail).toBe(own)
    expect(withFailurePath({ slug: 'x', retries: 3 }).onFail).toBeTypeOf('function')
  })
})

describe('the office’s payment link note', () => {
  it('says IIIC’s message sends the link once messages are set up, and asks the office before', () => {
    expect(OFFICE_COPY.linkCreated(150000, true)).toContain('IIIC’s message sends it')
    expect(OFFICE_COPY.linkCreated(150000, true)).not.toContain('yourself')
    expect(OFFICE_COPY.linkCreated(150000, false)).toContain('send it to the client yourself')
  })
})
