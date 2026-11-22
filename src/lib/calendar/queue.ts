import type { PayloadRequest } from 'payload'

import type { DomainEventName } from '@/lib/booking/events'

/**
 * The calendar's jobs (src/jobs/calendar.ts), by their automation IDs (docs/06): writing a
 * booking's entry in its practitioner's calendar (B2 on confirmation, B7 on a reschedule or a
 * cancellation), and refreshing busy times and watch channels (B14). Queued after the booking's
 * own change, in the same transaction, so a rolled-back change queues nothing and a calendar
 * failure never undoes a booking (docs/16 §7). A job's input is ids only.
 */
export const CALENDAR_TASKS = {
  syncBookingEvent: 'B2-B7-sync-calendar-event',
  refreshBusyTimes: 'B14-refresh-busy-times',
} as const

/**
 * The domain events that move a booking's calendar entry (docs/16 §9), for the booking module's
 * emit (src/lib/booking/emit.ts) to queue the calendar job on. A reschedule's event names the
 * new booking, which moves the old one's entry.
 */
export const CALENDAR_SUBSCRIPTIONS = {
  'booking.confirmed': CALENDAR_TASKS.syncBookingEvent,
  'booking.rescheduled': CALENDAR_TASKS.syncBookingEvent,
  'booking.cancelled': CALENDAR_TASKS.syncBookingEvent,
} as const satisfies Partial<Record<DomainEventName, string>>

/** The server's own writes from the calendar jobs, which the collections' hooks leave alone. */
export const CALENDAR_SYNC_CONTEXT = { calendarSync: true, auditAction: 'calendar-sync' } as const

/**
 * Runs one write with its own context, then gives the request its context back. Payload merges
 * a local call's `context` into the request for good (createLocalReq), so without this a
 * calendar write would mark every later change on the same request (the rest of a job run) as
 * the calendar's own.
 */
export async function withOwnContext<T>(req: PayloadRequest, run: () => Promise<T>): Promise<T> {
  const own = req.context
  try {
    return await run()
  } finally {
    req.context = own
  }
}

/** Queues the write, move or removal of a booking's calendar entry (B2, B7). */
export async function queueBookingCalendarSync(
  req: PayloadRequest,
  bookingId: number,
): Promise<void> {
  await req.payload.jobs.queue({
    task: CALENDAR_TASKS.syncBookingEvent,
    input: { bookingId },
    req,
  })
}

/** Queues a refresh of one practitioner's busy times (B14), or of everyone's. */
export async function queueBusyRefresh(req: PayloadRequest, practitionerId?: number) {
  await req.payload.jobs.queue({
    task: CALENDAR_TASKS.refreshBusyTimes,
    input: practitionerId === undefined ? {} : { practitionerId },
    req,
  })
}
