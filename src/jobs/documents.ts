import type { TaskConfig } from 'payload'

import { DOCUMENT_TASKS } from '@/lib/invoicing/queue'

/**
 * The documents module's tasks (docs/16 §12, builder F; docs/06 B3, B7): the tax invoice and the
 * payment record in Zoho Books when a payment is captured, and the credit note when a refund is
 * processed. Each is idempotent by its key (`payment:<id>:taxInvoice`, `refund:<id>:creditNote`)
 * and logs outcome codes only.
 *
 * A task fails, and Payload tries it again, when it left its document `failed`: Zoho did not
 * answer, refused, or disagreed with the platform's totals. A document that waits on IIIC's setup
 * (the GSTIN, the Zoho settings, the invoice a credit note answers) is an answer, not a failure:
 * it stays `pending` with the reason, for the office. The module is loaded when a task runs,
 * because it is server-only and holds the Zoho secrets.
 */

// docs/06, Engine rules: three attempts with backoff, then the job fails where the team sees it.
const RETRIES = { attempts: 3, backoff: { type: 'exponential' as const, delay: 60_000 } }

/** Thrown to have the job tried again; carries a code, never a name or an amount. */
class DocumentNotIssued extends Error {
  constructor(code: string) {
    super(`The document was not issued (${code}); the job will try again.`)
    this.name = 'DocumentNotIssued'
  }
}

type Outcome = { outcome: string; pdf?: string | null }

const OUTPUT: TaskConfig<{ input: object; output: Outcome }>['outputSchema'] = [
  { name: 'outcome', type: 'text', required: true },
  { name: 'pdf', type: 'text' },
]

export const issueInvoiceTask: TaskConfig<{ input: { paymentId: number }; output: Outcome }> = {
  slug: DOCUMENT_TASKS.issueInvoice,
  label: 'B3 · Issue the invoice in Zoho Books and record the payment',
  retries: RETRIES,
  inputSchema: [{ name: 'paymentId', type: 'number', required: true }],
  outputSchema: OUTPUT,
  handler: async ({ input, req }) => {
    const { issueInvoice } = await import('@/lib/invoicing/wiring')
    const result = await issueInvoice(req, { paymentId: input.paymentId })
    if (!result.ok) {
      const code = result.error.code === 'zoho' ? `zoho-${result.error.reason}` : result.error.code
      throw new DocumentNotIssued(code)
    }
    const { outcome, pdf } = result.value
    req.payload.logger.info({ msg: 'Invoice', outcome, pdf: pdf ?? null })
    return { output: { outcome, pdf: pdf ?? null } }
  },
}

export const issueCreditNoteTask: TaskConfig<{ input: { refundId: number }; output: Outcome }> = {
  slug: DOCUMENT_TASKS.issueCreditNote,
  label: 'B7 · Issue the credit note in Zoho Books for a processed refund',
  retries: RETRIES,
  inputSchema: [{ name: 'refundId', type: 'number', required: true }],
  outputSchema: OUTPUT,
  handler: async ({ input, req }) => {
    const { issueCreditNote } = await import('@/lib/invoicing/wiring')
    const result = await issueCreditNote(req, { refundId: input.refundId })
    if (!result.ok) {
      const code = result.error.code === 'zoho' ? `zoho-${result.error.reason}` : result.error.code
      throw new DocumentNotIssued(code)
    }
    const { outcome, pdf } = result.value
    req.payload.logger.info({ msg: 'Credit note', outcome, pdf: pdf ?? null })
    return { output: { outcome, pdf: pdf ?? null } }
  },
}

export const documentTasks = [issueInvoiceTask, issueCreditNoteTask]
