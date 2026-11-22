// @vitest-environment node
import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { DOCUMENT_TASKS } from '@/lib/invoicing/queue'
import { err, ok } from '@/lib/result'

vi.mock('server-only', () => ({}))

const wiring = vi.hoisted(() => ({ issueInvoice: vi.fn(), issueCreditNote: vi.fn() }))
vi.mock('@/lib/invoicing/wiring', () => wiring)

const { LISTENERS } = await import('@/lib/booking/emit')
const { jobs } = await import('@/jobs')
const { issueCreditNoteTask, issueInvoiceTask } = await import('@/jobs/documents')

// The documents' jobs (docs/06 B3, B7): queued on a captured payment and a processed refund,
// failing (so Payload retries) only when the document was left failed, and logging codes only.

const req = { payload: { logger: { info: vi.fn() } } } as unknown as PayloadRequest
type Handler = (args: { input: Record<string, number>; req: PayloadRequest }) => Promise<unknown>
const run = (handler: unknown, input: Record<string, number>) =>
  (handler as Handler)({ input, req })

describe('the documents’ jobs', () => {
  it('are registered and subscribed to the capture and the processed refund', () => {
    const slugs = (jobs.tasks ?? []).map((task) => task.slug)
    expect(slugs).toEqual(expect.arrayContaining(Object.values(DOCUMENT_TASKS)))
    expect(LISTENERS['payment.captured']).toEqual(['B3-issue-invoice'])
    expect(LISTENERS['refund.processed']).toEqual(['B7-issue-credit-note'])
  })

  it('answer an outcome, and throw a code (never a name or an amount) when a document failed', async () => {
    wiring.issueInvoice.mockResolvedValueOnce(
      ok({ outcome: 'issued', invoiceId: 1, pdf: 'stored' }),
    )
    await expect(run(issueInvoiceTask.handler, { paymentId: 4 })).resolves.toEqual({
      output: { outcome: 'issued', pdf: 'stored' },
    })
    expect(wiring.issueInvoice).toHaveBeenCalledWith(req, { paymentId: 4 })

    wiring.issueInvoice.mockResolvedValueOnce(
      err({ code: 'zoho', reason: 'unavailable', passing: true }),
    )
    await expect(run(issueInvoiceTask.handler, { paymentId: 4 })).rejects.toThrow(
      /zoho-unavailable/,
    )

    wiring.issueCreditNote.mockResolvedValueOnce(
      ok({ outcome: 'invoice-not-issued', invoiceId: 2 }),
    )
    await expect(run(issueCreditNoteTask.handler, { refundId: 5 })).resolves.toEqual({
      output: { outcome: 'invoice-not-issued', pdf: null },
    })
    wiring.issueCreditNote.mockResolvedValueOnce(err({ code: 'totals-mismatch' }))
    await expect(run(issueCreditNoteTask.handler, { refundId: 5 })).rejects.toThrow(
      /totals-mismatch/,
    )
  })
})
