import type { Interval } from '@/lib/booking/types'
import { err, ok, type Result } from '@/lib/result'

import type {
  CalendarError,
  CalendarEventInput,
  CalendarEventRef,
  CalendarProvider,
  CalendarWatch,
} from './provider'

type StoredEvent = CalendarEventInput & { eventId: string; meetUrl: string | null }

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end

/**
 * An in-memory calendar for tests (docs/16 §11): busy times a test sets by hand, and the events
 * the platform writes, kept so a test can read what reached the practitioner's calendar. Like
 * Google's free/busy answer, the busy times include the events the platform wrote.
 */
export class FakeCalendar implements CalendarProvider {
  readonly name = 'fake' as const
  /** Busy times by calendar id, as a practitioner's own appointments. */
  readonly busy = new Map<string, Interval[]>()
  /** Events by calendar id. */
  readonly events = new Map<string, StoredEvent[]>()
  readonly watches = new Map<string, CalendarWatch & { calendarId: string; token: string }>()
  /** Calendars the service account may not reach (delegation missing). */
  readonly forbidden = new Set<string>()
  private next = 0

  private reach(calendarId: string): CalendarError | null {
    return this.forbidden.has(calendarId) ? { code: 'forbidden' } : null
  }

  async freeBusy(calendarId: string, window: Interval): Promise<Result<Interval[], CalendarError>> {
    const failure = this.reach(calendarId)
    if (failure) return err(failure)
    const own = this.busy.get(calendarId) ?? []
    const written = (this.events.get(calendarId) ?? []).map(({ start, end }) => ({ start, end }))
    return ok(
      [...own, ...written]
        .filter((interval) => overlaps(interval, window))
        .sort((a, b) => a.start.getTime() - b.start.getTime()),
    )
  }

  async createEvent(
    calendarId: string,
    event: CalendarEventInput,
  ): Promise<Result<CalendarEventRef, CalendarError>> {
    const failure = this.reach(calendarId)
    if (failure) return err(failure)
    const list = this.events.get(calendarId) ?? []
    // One event per booking: a retry finds the one already written.
    const existing = list.find((stored) => stored.reference === event.reference)
    if (existing) return ok({ eventId: existing.eventId, meetUrl: existing.meetUrl })
    const eventId = `fake-event-${++this.next}`
    const meetUrl = event.meet ? `https://meet.example.invalid/${eventId}` : null
    list.push({ ...event, eventId, meetUrl })
    this.events.set(calendarId, list)
    return ok({ eventId, meetUrl })
  }

  async updateEvent(
    calendarId: string,
    eventId: string,
    event: CalendarEventInput,
  ): Promise<Result<CalendarEventRef, CalendarError>> {
    const failure = this.reach(calendarId)
    if (failure) return err(failure)
    const list = this.events.get(calendarId) ?? []
    const index = list.findIndex((stored) => stored.eventId === eventId)
    if (index < 0) return err({ code: 'not-found' })
    const meetUrl = event.meet
      ? (list[index]?.meetUrl ?? `https://meet.example.invalid/${eventId}`)
      : null
    list[index] = { ...event, eventId, meetUrl }
    return ok({ eventId, meetUrl })
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<Result<void, CalendarError>> {
    const failure = this.reach(calendarId)
    if (failure) return err(failure)
    const list = this.events.get(calendarId) ?? []
    const kept = list.filter((stored) => stored.eventId !== eventId)
    if (kept.length === list.length) return err({ code: 'not-found' })
    this.events.set(calendarId, kept)
    return ok(undefined)
  }

  async watch(
    calendarId: string,
    channel: { channelId: string; token: string; address: string },
  ): Promise<Result<CalendarWatch, CalendarError>> {
    const failure = this.reach(calendarId)
    if (failure) return err(failure)
    const watch = {
      channelId: channel.channelId,
      resourceId: `fake-resource-${calendarId}`,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
      calendarId,
      token: channel.token,
    }
    this.watches.set(channel.channelId, watch)
    return ok({
      channelId: watch.channelId,
      resourceId: watch.resourceId,
      expiresAt: watch.expiresAt,
    })
  }

  async stopWatch(channel: {
    channelId: string
    resourceId: string
  }): Promise<Result<void, CalendarError>> {
    this.watches.delete(channel.channelId)
    return ok(undefined)
  }
}
