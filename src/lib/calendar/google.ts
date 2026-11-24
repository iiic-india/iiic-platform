import 'server-only'

import { auth, calendar, type calendar_v3 } from '@googleapis/calendar'

import type { Interval } from '@/lib/booking/types'
import { err, ok, type Result } from '@/lib/result'

import { calendarSubject, type GoogleCalendarConfig } from './config'
import {
  busyFromFreeBusy,
  calendarErrorOf,
  freeBusyChunks,
  googleEventId,
  meetUrlOf,
  toGoogleEvent,
  watchFrom,
} from './googleEvent'
import type {
  CalendarError,
  CalendarEventInput,
  CalendarEventRef,
  CalendarProvider,
  CalendarWatch,
} from './provider'

/**
 * Google Calendar through the official client (`@googleapis/calendar`, pinned) and a Workspace
 * service account with domain-wide delegation (D-22, D-23; docs/16 §7). For each calendar the
 * account acts as the practitioner whose address it is, on the Workspace domain only, with two
 * scopes: events (write the booking, watch for changes) and free/busy (read busy times, never an
 * event's title, guests or description). No token is stored; the client signs its own.
 *
 * Events are written without guests and with no description, as private entries, so nothing
 * beyond the time, the service, the first name, the reference and the place reaches Google
 * (docs/08 §8). Every failure is returned as a code; Google's message, which can name the
 * calendar and the person, is never logged or passed on.
 */

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
]

/** Long enough for Google, short enough to leave a function time to answer. */
const TIMEOUT_MS = 10_000

const failed = (error: unknown): { ok: false; error: CalendarError } => {
  const failure = calendarErrorOf(error)
  return err(failure.code === 'conflict' ? { code: 'unavailable' } : failure)
}

export class GoogleCalendar implements CalendarProvider {
  readonly name = 'google' as const
  private readonly clients = new Map<string, calendar_v3.Calendar>()

  /**
   * @param host The platform's host: a booking's event id is made from its reference at this
   * host, so a local or test database never writes over production's events.
   */
  constructor(
    private readonly config: GoogleCalendarConfig,
    private readonly host: string,
  ) {}

  /** The client acting as the calendar's owner, or none for a calendar outside the domain. */
  private reach(calendarId: string): { client: calendar_v3.Calendar; subject: string } | null {
    const subject = calendarSubject(calendarId, this.config.workspaceDomain)
    if (!subject) return null
    let client = this.clients.get(subject)
    if (!client) {
      const signer = new auth.JWT({
        email: this.config.serviceAccountEmail,
        key: this.config.privateKey,
        scopes: SCOPES,
        subject,
      })
      client = calendar({ version: 'v3', auth: signer, timeout: TIMEOUT_MS })
      this.clients.set(subject, client)
    }
    return { client, subject }
  }

  async freeBusy(calendarId: string, window: Interval): Promise<Result<Interval[], CalendarError>> {
    const reached = this.reach(calendarId)
    if (!reached) return err({ code: 'forbidden' })
    const busy: Interval[] = []
    for (const chunk of freeBusyChunks(window)) {
      try {
        const { data } = await reached.client.freebusy.query({
          requestBody: {
            timeMin: chunk.start.toISOString(),
            timeMax: chunk.end.toISOString(),
            items: [{ id: reached.subject }],
          },
        })
        const read = busyFromFreeBusy(data, reached.subject)
        if (!read.ok) return read
        busy.push(...read.value)
      } catch (error) {
        return failed(error)
      }
    }
    return ok(busy)
  }

  async createEvent(
    calendarId: string,
    event: CalendarEventInput,
  ): Promise<Result<CalendarEventRef, CalendarError>> {
    const reached = this.reach(calendarId)
    if (!reached) return err({ code: 'forbidden' })
    const eventId = googleEventId(`${event.reference}@${this.host}`)
    try {
      const { data } = await reached.client.events.insert({
        calendarId: reached.subject,
        conferenceDataVersion: 1,
        sendUpdates: 'none',
        requestBody: toGoogleEvent(event, eventId, 'insert'),
      })
      return ok({ eventId: data.id ?? eventId, meetUrl: meetUrlOf(data) })
    } catch (error) {
      // A retry meets the event its first attempt made: bring that one up to date instead.
      if (calendarErrorOf(error).code === 'conflict') {
        return this.updateEvent(calendarId, eventId, event)
      }
      return failed(error)
    }
  }

  async updateEvent(
    calendarId: string,
    eventId: string,
    event: CalendarEventInput,
  ): Promise<Result<CalendarEventRef, CalendarError>> {
    const reached = this.reach(calendarId)
    if (!reached) return err({ code: 'forbidden' })
    try {
      const { data } = await reached.client.events.patch({
        calendarId: reached.subject,
        eventId,
        conferenceDataVersion: 1,
        sendUpdates: 'none',
        requestBody: toGoogleEvent(event, eventId, 'patch'),
      })
      return ok({ eventId: data.id ?? eventId, meetUrl: meetUrlOf(data) })
    } catch (error) {
      return failed(error)
    }
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<Result<void, CalendarError>> {
    const reached = this.reach(calendarId)
    if (!reached) return err({ code: 'forbidden' })
    try {
      await reached.client.events.delete({
        calendarId: reached.subject,
        eventId,
        sendUpdates: 'none',
      })
      return ok(undefined)
    } catch (error) {
      return failed(error)
    }
  }

  async watch(
    calendarId: string,
    channel: { channelId: string; token: string; address: string },
  ): Promise<Result<CalendarWatch, CalendarError>> {
    const reached = this.reach(calendarId)
    if (!reached) return err({ code: 'forbidden' })
    try {
      const { data } = await reached.client.events.watch({
        calendarId: reached.subject,
        requestBody: {
          id: channel.channelId,
          type: 'web_hook',
          address: channel.address,
          token: channel.token,
        },
      })
      return watchFrom(data)
    } catch (error) {
      return failed(error)
    }
  }

  /**
   * Stops a channel. Google stops a channel only for the account that opened it, so the caller
   * names the calendar it watched (sync.ts always does); without it nothing can be stopped, and
   * the channel simply runs out.
   */
  async stopWatch(channel: {
    channelId: string
    resourceId: string
    calendarId?: string
  }): Promise<Result<void, CalendarError>> {
    const reached = channel.calendarId ? this.reach(channel.calendarId) : null
    if (!reached) return err({ code: 'forbidden' })
    try {
      await reached.client.channels.stop({
        requestBody: { id: channel.channelId, resourceId: channel.resourceId },
      })
      return ok(undefined)
    } catch (error) {
      return failed(error)
    }
  }
}
