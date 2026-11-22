import type { PayloadRequest } from 'payload'

import type { Interval } from '@/lib/booking/types'
import type { Result } from '@/lib/result'

/**
 * A practitioner's calendar as the platform uses it (D-22; docs/16 §7): free and busy times read,
 * one event per booking written, and change notifications watched. Google Calendar through the
 * official client (`@googleapis/calendar`, pinned) with a Workspace service account and
 * domain-wide delegation limited to the Calendar scope, in src/lib/calendar/google.ts
 * ('server-only'); an in-memory fake for tests (src/lib/calendar/fakeCalendar.ts).
 *
 * What may reach a practitioner's calendar (docs/08 §8): the time, the service's name, the
 * client's first name, the booking reference, and the Meet link or the office address. Never a
 * surname, a contact detail, a time request's note or anything said in a session; the client is
 * never added as a guest (their invite is the platform's own `.ics`).
 */

export type CalendarError =
  | { code: 'not-configured' }
  | { code: 'unavailable' }
  | { code: 'forbidden' } // delegation missing for this calendar (I-24)
  | { code: 'not-found' }

/** One booking as it goes into the practitioner's calendar. */
export type CalendarEventInput = {
  /** The booking's reference, also the event's private key, so a retry finds it. */
  reference: string
  start: Date
  end: Date
  /** Such as "30-minute session · Asha · IIIC-S-24117": first name only. */
  title: string
  /** The office address for a session there; none for online. */
  location: string | null
  /** Ask Google for a unique Meet link (online sessions, D-03). */
  meet: boolean
}

export type CalendarEventRef = { eventId: string; meetUrl: string | null }

/** A change-notification channel and when it must be renewed (B14). */
export type CalendarWatch = { channelId: string; resourceId: string; expiresAt: Date }

export interface CalendarProvider {
  readonly name: 'google' | 'fake'
  /** Busy times only, from the free/busy answer: no event's title, guests or description. */
  freeBusy(calendarId: string, window: Interval): Promise<Result<Interval[], CalendarError>>
  createEvent(
    calendarId: string,
    event: CalendarEventInput,
  ): Promise<Result<CalendarEventRef, CalendarError>>
  updateEvent(
    calendarId: string,
    eventId: string,
    event: CalendarEventInput,
  ): Promise<Result<CalendarEventRef, CalendarError>>
  deleteEvent(calendarId: string, eventId: string): Promise<Result<void, CalendarError>>
  /** Watches the calendar; Google posts to /api/webhooks/google-calendar with the token. */
  watch(
    calendarId: string,
    channel: { channelId: string; token: string; address: string },
  ): Promise<Result<CalendarWatch, CalendarError>>
  stopWatch(channel: {
    channelId: string
    resourceId: string
  }): Promise<Result<void, CalendarError>>
}

/**
 * Replaces a practitioner's busy blocks for [now, now + the longest horizon] with the free/busy
 * answer, in one transaction (B14; on each change notification and every 15 minutes).
 */
export type RefreshBusyBlocks = (
  req: PayloadRequest,
  input: { practitionerId: number; now: Date },
) => Promise<Result<{ blocks: number }, CalendarError>>

/**
 * Writes a confirmed booking to its practitioner's calendar, or moves or removes its event on a
 * reschedule or cancellation (B2, B7), and keeps the event id and Meet link on the booking. Runs
 * as a job after the booking's transaction, retried; a failure never undoes a booking.
 */
export type SyncBookingEvent = (
  req: PayloadRequest,
  input: { bookingId: number },
) => Promise<Result<CalendarEventRef | null, CalendarError>>
