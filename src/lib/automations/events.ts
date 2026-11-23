import type { DomainEvent } from '@/lib/booking/events'

/**
 * Every event an automation listens to (docs/19 §2): M3's domain events (src/lib/booking/events.ts)
 * and the ones M6, M4 and M5 raise. Like M3's, an event carries ids only, never a name, a contact
 * detail, a note, an amount or anything said in counselling (CLAUDE.md #3), so a job's input and
 * its logs hold nothing personal. Events of M4 and M5 are named here so their automations are
 * wired before those milestones arrive; until something emits them, nothing runs.
 */
export type AutomationEvent =
  | DomainEvent
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
  // M4 · the pipeline (docs/04 leads, proposals).
  | { name: 'lead.created'; leadId: number; source: 'teamMap' | 'partnership' | 'call' } // P1, P2, P7
  | { name: 'proposal.sent'; proposalId: number } // P5, P6
  // M5 · certificates and privacy.
  | { name: 'certificate.issued'; certificateId: number } // C5
  | { name: 'dataRequest.received'; dataRequestId: number } // O4, O7
  | { name: 'incident.opened'; incidentId: number } // O8

export type AutomationEventName = AutomationEvent['name']

/** The id field each event is about: its idempotency key is `<event>:<id>`. */
const SUBJECT_FIELD: { readonly [Name in AutomationEventName]: string } = {
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
  'lead.created': 'leadId',
  'proposal.sent': 'proposalId',
  'certificate.issued': 'certificateId',
  'dataRequest.received': 'dataRequestId',
  'incident.opened': 'incidentId',
}

/** The idempotency key of an event's jobs, `<event>:<id>`, the same rule as M3's `eventKey`. */
export function automationEventKey(event: AutomationEvent): string {
  const field = SUBJECT_FIELD[event.name]
  const id = (event as unknown as Record<string, unknown>)[field]
  return `${event.name}:${String(id)}`
}

export const AUTOMATION_EVENT_NAMES = Object.keys(SUBJECT_FIELD) as AutomationEventName[]
