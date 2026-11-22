import type { DomainEventName } from '@/lib/booking/events'

/**
 * The documents module's jobs, by their automation IDs (docs/06): the invoice and the payment
 * record on a captured payment (B3), and the credit note when a refund is processed (B7, docs/16
 * §9). Queued by the booking module's `emit` in the transaction that captured the payment or
 * processed the refund, so a rolled-back change queues nothing; a job's input is ids only.
 */
export const DOCUMENT_TASKS = {
  issueInvoice: 'B3-issue-invoice',
  issueCreditNote: 'B7-issue-credit-note',
} as const

export const DOCUMENT_SUBSCRIPTIONS = {
  'payment.captured': DOCUMENT_TASKS.issueInvoice,
  'refund.processed': DOCUMENT_TASKS.issueCreditNote,
} as const satisfies Partial<Record<DomainEventName, string>>
