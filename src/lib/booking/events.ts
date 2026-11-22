import type { PayloadRequest } from 'payload'

/**
 * The domain events M3 raises and M6's automations listen to (docs/06, Engine rules: "Domain
 * events enqueue jobs with an idempotency key"). An event carries ids only: never a name, a
 * contact detail, a note or an amount the person could be identified by, so a job's input and
 * its logs hold nothing personal, and nothing said in counselling can reach a message, a route
 * or analytics (CLAUDE.md #3). The listener reads what it needs, under its own access.
 *
 * `emit` queues one Payload job per subscribed task in the same transaction as the change
 * (Payload's jobs live in Postgres, so a rolled-back change queues nothing), with the
 * idempotency key `<event>:<id>[:<version>]`. The subscriptions are M6's (src/jobs/); until
 * then an event has no listener and emitting it queues nothing.
 */
export type DomainEvent =
  | { name: 'booking.held'; bookingId: number } // B1
  | { name: 'booking.holdExpired'; bookingId: number } // B4
  | { name: 'booking.requested'; bookingId: number } // B12
  | {
      name: 'booking.confirmed'
      bookingId: number
      cause: 'paymentCaptured' | 'noPaymentAtBooking' | 'timeAgreed' | 'staff'
    } // B2, B3a, B5, B6, P2
  | { name: 'booking.rescheduled'; bookingId: number; fromBookingId: number } // B7
  | { name: 'booking.cancelled'; bookingId: number; by: 'client' | 'iiic' } // B7
  | { name: 'booking.completed'; bookingId: number } // B8
  | { name: 'booking.noShow'; bookingId: number } // B9
  | { name: 'booking.slotLost'; bookingId: number; paymentId: number } // B10
  | { name: 'payment.captured'; paymentId: number; bookingId: number } // B3
  | { name: 'payment.failed'; paymentId: number; bookingId: number }
  | { name: 'payment.linkSent'; paymentId: number; bookingId: number } // B13
  | { name: 'refund.awaitingApproval'; refundId: number } // Today, Money
  | { name: 'refund.processed'; refundId: number } // B7 (client told), credit note
  | { name: 'reconciliation.mismatch'; gatewayEventId: number } // B11
  | { name: 'calendar.changed'; practitionerId: number } // B14

export type DomainEventName = DomainEvent['name']

/** Queues the event's listeners inside the request's transaction (docs/16 §8). */
export type EmitDomainEvent = (req: PayloadRequest, event: DomainEvent) => Promise<void>
