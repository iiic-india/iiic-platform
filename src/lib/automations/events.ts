import type { DomainEvent } from '@/lib/booking/events'
import { PIPELINE_EVENT_NAMES, pipelineEventKey } from '@/lib/pipeline/core/emit'
import type { PipelineEvent, PipelineEventName } from '@/lib/pipeline/events'

/**
 * Every event an automation listens to (docs/19 §2): M3's domain events (src/lib/booking/events.ts),
 * M4's pipeline events (src/lib/pipeline/events.ts, docs/17 §8), and the ones M6 and M5 raise.
 * Like M3's, an event carries ids and codes only, never a name, a contact detail, a note, an
 * amount or anything said in counselling (CLAUDE.md #3), so a job's input and its logs hold
 * nothing personal. Events of M5 are named here so their automations are wired before that
 * milestone arrives; until something emits them, nothing runs.
 */
export type AutomationEvent =
  | DomainEvent
  | PipelineEvent
  // M3's documents module, at the join: the invoice or receipt Zoho Books issued (B3's email).
  | { name: 'invoice.issued'; invoiceId: number; bookingId: number }
  // M6 · messaging core (builder A).
  | { name: 'message.failed'; messageId: number } // O3
  | { name: 'automation.failed'; jobId: number } // O3: an M6 task that spent its retries
  | { name: 'message.suppressed'; suppressionId: number } // O9, N3
  // M6 · consent and proof (builder C).
  | { name: 'consent.withdrawn'; consentId: number } // V2's confirmation, N3
  | { name: 'review.consentRequested'; testimonialId: number } // V1
  | { name: 'newsletter.signedUp'; subscriberId: number } // N1
  | { name: 'newsletter.confirmed'; subscriberId: number } // N2
  | { name: 'newsletter.issueScheduled'; issueId: number } // N4
  // M5 · certificates and privacy.
  | { name: 'certificate.issued'; certificateId: number } // C5
  | { name: 'dataRequest.received'; dataRequestId: number } // O4, O7
  | { name: 'incident.opened'; incidentId: number } // O8

export type AutomationEventName = AutomationEvent['name']

/**
 * M4's events are keyed by M4's own rule (`pipelineEventKey`): a repeatable event is told apart by
 * what makes it different (the stage change's activity, the untouched level, the quiet spell, the
 * version sent), so the key M6's listeners see is the key M4 queued them with.
 */
const PIPELINE_EVENTS: ReadonlySet<string> = new Set(PIPELINE_EVENT_NAMES)

function isPipelineEvent(event: AutomationEvent): event is PipelineEvent {
  return PIPELINE_EVENTS.has(event.name)
}

/** The id field every other event is about: its idempotency key is `<event>:<id>`. */
const SUBJECT_FIELD: {
  readonly [Name in Exclude<AutomationEventName, PipelineEventName>]: string
} = {
  'booking.held': 'bookingId',
  'booking.holdExpired': 'bookingId',
  'booking.requested': 'bookingId',
  'booking.confirmed': 'bookingId',
  'booking.rescheduled': 'bookingId',
  'booking.cancelled': 'bookingId',
  'booking.completed': 'bookingId',
  'booking.noShow': 'bookingId',
  'booking.slotLost': 'bookingId',
  'payment.captured': 'paymentId',
  'payment.failed': 'paymentId',
  'payment.linkSent': 'paymentId',
  'refund.awaitingApproval': 'refundId',
  'refund.processed': 'refundId',
  'reconciliation.mismatch': 'gatewayEventId',
  'calendar.changed': 'practitionerId',
  'invoice.issued': 'invoiceId',
  'message.failed': 'messageId',
  'automation.failed': 'jobId',
  'message.suppressed': 'suppressionId',
  'consent.withdrawn': 'consentId',
  'review.consentRequested': 'testimonialId',
  'newsletter.signedUp': 'subscriberId',
  'newsletter.confirmed': 'subscriberId',
  'newsletter.issueScheduled': 'issueId',
  'certificate.issued': 'certificateId',
  'dataRequest.received': 'dataRequestId',
  'incident.opened': 'incidentId',
}

/** The idempotency key of an event's jobs: M3's rule `<event>:<id>`, and M4's for its events. */
export function automationEventKey(event: AutomationEvent): string {
  if (isPipelineEvent(event)) return pipelineEventKey(event)
  const field = SUBJECT_FIELD[event.name as keyof typeof SUBJECT_FIELD]
  const id = (event as unknown as Record<string, unknown>)[field]
  return `${event.name}:${String(id)}`
}

export const AUTOMATION_EVENT_NAMES = [
  ...(Object.keys(SUBJECT_FIELD) as AutomationEventName[]),
  ...PIPELINE_EVENT_NAMES,
]
