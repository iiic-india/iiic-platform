import 'server-only'

import type { PayloadRequest } from 'payload'

import { CALENDAR_SUBSCRIPTIONS } from '@/lib/calendar/queue'
import { DOCUMENT_SUBSCRIPTIONS } from '@/lib/invoicing/queue'

import type { DomainEvent, DomainEventName, EmitDomainEvent } from './events'

/**
 * Domain events into jobs (docs/16 §9; docs/06, Engine rules). An event queues one Payload job
 * per task subscribed to it, inside the request's transaction (Payload's jobs live in Postgres, so
 * a change that is rolled back queues nothing), with the key `<event>:<id>` in the job's input; a
 * job still waiting with the same key is not queued twice, so a retried step queues nothing new.
 * M3 subscribes the calendar write and the documents; the messages' subscriptions are M6's.
 *
 * The job's input is the event itself: ids only, never a name, a contact detail, a note or an
 * amount (CLAUDE.md #3), so nothing personal reaches a job's input or its logs.
 */

/** The tasks each event starts, by their automation IDs (docs/06). M6 adds its own. */
export type Listeners = { readonly [Name in DomainEventName]?: readonly string[] }

/**
 * M3's own listeners: the calendar write (B2, B7), after the booking's change commits, and the
 * documents in Zoho Books (B3's invoice on a capture, the credit note on a processed refund).
 */
export const LISTENERS: Listeners = {
  'booking.confirmed': [CALENDAR_SUBSCRIPTIONS['booking.confirmed']],
  'booking.rescheduled': [CALENDAR_SUBSCRIPTIONS['booking.rescheduled']],
  'booking.cancelled': [CALENDAR_SUBSCRIPTIONS['booking.cancelled']],
  'payment.captured': [DOCUMENT_SUBSCRIPTIONS['payment.captured']],
  'refund.processed': [DOCUMENT_SUBSCRIPTIONS['refund.processed']],
}

/** The id an event is about, for its idempotency key. */
function subjectOf(event: DomainEvent): number {
  switch (event.name) {
    case 'payment.captured':
    case 'payment.failed':
    case 'payment.linkSent':
      return event.paymentId
    case 'refund.awaitingApproval':
    case 'refund.processed':
      return event.refundId
    case 'reconciliation.mismatch':
      return event.gatewayEventId
    case 'calendar.changed':
      return event.practitionerId
    default:
      return event.bookingId
  }
}

/** The idempotency key of an event's jobs: `<event>:<id>`. */
export function eventKey(event: DomainEvent): string {
  return `${event.name}:${subjectOf(event)}`
}

type Queue = (args: {
  task: string
  input: Record<string, unknown>
  req: PayloadRequest
}) => Promise<unknown>

/** An emitter for a set of listeners (the real one is `emit`; tests give their own). */
export function emitterFor(listeners: Listeners): EmitDomainEvent {
  return async (req, event) => {
    const tasks = listeners[event.name] ?? []
    if (!tasks.length) return
    const key = eventKey(event)
    for (const task of tasks) {
      const waiting = await req.payload.count({
        collection: 'payload-jobs',
        where: {
          and: [
            { taskSlug: { equals: task } },
            { 'input.key': { equals: key } },
            { completedAt: { exists: false } },
          ],
        },
        overrideAccess: true,
        req,
      })
      if (waiting.totalDocs > 0) continue
      await (req.payload.jobs.queue as unknown as Queue)({ task, input: { ...event, key }, req })
    }
  }
}

/** Queues the event's listeners inside the request's transaction. */
export const emit: EmitDomainEvent = emitterFor(LISTENERS)
