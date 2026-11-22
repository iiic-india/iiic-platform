import type { TaskConfig } from 'payload'

import { CALENDAR_TASKS } from '@/lib/calendar/queue'

/**
 * The calendar module's tasks (docs/16 §7, §12; D-22): writing a booking's entry in its
 * practitioner's calendar (B2, B7) and refreshing busy times and watch channels (B14). Each is
 * named by its automation ID, is idempotent, and logs outcome codes only (CLAUDE.md, Logs).
 *
 * The handlers load the calendar module when they run, not when the config loads: it is
 * server-only and reads the Google settings, and the Payload CLI (migrations, type generation)
 * loads this file too. Nothing runs these on their own yet: the cron runner of M6 queues B14
 * every 15 minutes and runs the queue (docs/07, Jobs); until then an owner runs them through the
 * jobs API.
 */

// docs/06, Engine rules: three attempts with backoff, then the job fails where the team sees it.
const RETRIES = { attempts: 3, backoff: { type: 'exponential' as const, delay: 60_000 } }

/** Thrown to have the job tried again; carries no detail of the booking or the calendar. */
class CalendarUnavailable extends Error {
  constructor() {
    super('The calendar did not answer; the job will try again.')
    this.name = 'CalendarUnavailable'
  }
}

export const syncCalendarEventTask: TaskConfig<typeof CALENDAR_TASKS.syncBookingEvent> = {
  slug: CALENDAR_TASKS.syncBookingEvent,
  label: 'B2 · B7 · Write, move or remove a booking in its practitioner’s calendar',
  retries: RETRIES,
  inputSchema: [{ name: 'bookingId', type: 'number', required: true }],
  outputSchema: [{ name: 'outcome', type: 'text', required: true }],
  handler: async ({ input, req }) => {
    const { syncBookingEvent } = await import('@/lib/calendar/calendarFor')
    const result = await syncBookingEvent(req, { bookingId: input.bookingId })
    if (result.ok) return { output: { outcome: result.value ? 'written' : 'nothing-to-do' } }
    // A passing outage, or a Meet link Google has not made yet: try again. Anything else is an
    // answer (no calendar settings, a calendar out of reach, the booking gone), recorded on the
    // connection where it is the calendar's.
    if (result.error.code === 'unavailable') throw new CalendarUnavailable()
    req.payload.logger.info({ msg: 'Calendar entry not written', outcome: result.error.code })
    return { output: { outcome: result.error.code } }
  },
}

export const refreshBusyTimesTask: TaskConfig<typeof CALENDAR_TASKS.refreshBusyTimes> = {
  slug: CALENDAR_TASKS.refreshBusyTimes,
  label: 'B14 · Read busy times from the practitioners’ calendars and renew their watch',
  retries: RETRIES,
  inputSchema: [{ name: 'practitionerId', type: 'number' }],
  outputSchema: [
    { name: 'outcome', type: 'text', required: true },
    { name: 'refreshed', type: 'number', required: true },
    { name: 'failed', type: 'number', required: true },
    { name: 'renewed', type: 'number', required: true },
  ],
  handler: async ({ input, req }) => {
    const { refreshBusyBlocks, sweepCalendars } = await import('@/lib/calendar/calendarFor')
    const now = new Date()
    if (typeof input.practitionerId === 'number') {
      const result = await refreshBusyBlocks(req, { practitionerId: input.practitionerId, now })
      if (!result.ok && result.error.code === 'unavailable') throw new CalendarUnavailable()
      return {
        output: {
          outcome: result.ok ? 'done' : result.error.code,
          refreshed: result.ok ? 1 : 0,
          failed: result.ok ? 0 : 1,
          renewed: 0,
        },
      }
    }
    // The sweep runs every 15 minutes: a calendar that failed is read again then, not retried.
    const swept = await sweepCalendars(req, now)
    if (swept.outcome === 'not-configured') {
      return { output: { outcome: swept.outcome, refreshed: 0, failed: 0, renewed: 0 } }
    }
    const { refreshed, failed, renewed } = swept
    req.payload.logger.info({ msg: 'Busy times refreshed', refreshed, failed, renewed })
    return { output: { outcome: 'done', refreshed, failed, renewed } }
  },
}

export const calendarTasks = [syncCalendarEventTask, refreshBusyTimesTask]
