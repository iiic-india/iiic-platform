import type { calendar_v3 } from '@googleapis/calendar'
import { addDays, min } from 'date-fns'
import { z } from 'zod'

import type { Interval } from '@/lib/booking/types'
import { err, ok, type Result } from '@/lib/result'
import { IST } from '@/lib/time/ist'

import type { CalendarError, CalendarEventInput, CalendarWatch } from './provider'

/**
 * The shapes Google Calendar's API takes and gives (D-22; docs/16 §7), kept apart from the client
 * in google.ts so they can be tested without a network. Every answer is read with Zod; an
 * answer that does not match is `unavailable`, never trusted.
 */

/** The name the booking's reference goes by in an event's private properties. */
export const REFERENCE_PROPERTY = 'iiicReference'

/**
 * A Google event id for a booking, the same on every attempt, so a retried insert meets the
 * event it already made (409) instead of making a second. Google allows the characters of
 * base32hex (a–v, 0–9), five to 1024 of them; hexadecimal is a subset.
 */
export function googleEventId(key: string): string {
  return Buffer.from(key, 'utf8').toString('hex')
}

/**
 * The event as Google takes it: no guests, no description, private to the practitioner's
 * calendar, busy, with a Meet link asked for by a request id that stays the event's own (so a
 * repeat never makes a second conference). A patch clears an address the booking no longer
 * has; a Meet link made earlier stays on the practitioner's entry (Google's client has no way to
 * remove one), while the booking and the client's invite drop it (sync.ts, ics.ts).
 */
export function toGoogleEvent(
  input: CalendarEventInput,
  eventId: string,
  mode: 'insert' | 'patch',
): calendar_v3.Schema$Event {
  const event: calendar_v3.Schema$Event = {
    summary: input.title,
    start: { dateTime: input.start.toISOString(), timeZone: IST },
    end: { dateTime: input.end.toISOString(), timeZone: IST },
    status: 'confirmed',
    visibility: 'private',
    transparency: 'opaque',
    guestsCanInviteOthers: false,
    guestsCanSeeOtherGuests: false,
    extendedProperties: { private: { [REFERENCE_PROPERTY]: input.reference } },
  }
  if (mode === 'insert') event.id = eventId
  if (input.location) event.location = input.location
  else if (mode === 'patch') event.location = null
  if (input.meet) {
    event.conferenceData = {
      createRequest: { requestId: eventId, conferenceSolutionKey: { type: 'hangoutsMeet' } },
    }
  }
  return event
}

/** The event's Meet link, once Google has made it. */
export function meetUrlOf(event: calendar_v3.Schema$Event | null | undefined): string | null {
  if (event?.hangoutLink) return event.hangoutLink
  const video = event?.conferenceData?.entryPoints?.find(
    (entry) => entry.entryPointType === 'video' && entry.uri,
  )
  return video?.uri ?? null
}

const RATE_LIMITS = new Set([
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'quotaExceeded',
  'dailyLimitExceeded',
])
// The token endpoint's answers when delegation is missing or the key is not accepted.
const AUTH_REFUSALS = new Set(['unauthorized_client', 'invalid_grant', 'access_denied'])

type GoogleFailure = {
  status?: number | string
  code?: number | string
  response?: { status?: number; data?: { error?: unknown } }
}

const reasonOf = (data: { error?: unknown } | undefined): string | undefined => {
  const detail = data?.error
  if (typeof detail === 'string') return detail
  const first = (detail as { errors?: { reason?: unknown }[] } | undefined)?.errors?.[0]?.reason
  return typeof first === 'string' ? first : undefined
}

/**
 * A failure from Google's client as the provider's typed error. Its message is never read or
 * logged: it can name the calendar and the person.
 */
export function calendarErrorOf(error: unknown): CalendarError | { code: 'conflict' } {
  const failure = (error ?? {}) as GoogleFailure
  const status = Number(failure.response?.status ?? failure.status ?? failure.code)
  const reason = reasonOf(failure.response?.data)
  if (reason && RATE_LIMITS.has(reason)) return { code: 'unavailable' }
  if (reason && AUTH_REFUSALS.has(reason)) return { code: 'forbidden' }
  if (status === 401 || status === 403) return { code: 'forbidden' }
  if (status === 404 || status === 410) return { code: 'not-found' }
  if (status === 409) return { code: 'conflict' }
  return { code: 'unavailable' }
}

const FreeBusyAnswer = z.object({
  calendars: z.record(
    z.string(),
    z.object({
      errors: z.array(z.object({ reason: z.string().optional() })).nullish(),
      busy: z.array(z.object({ start: z.string(), end: z.string() })).nullish(),
    }),
  ),
})

/** A calendar's busy times out of the free/busy answer: start and end, nothing else. */
export function busyFromFreeBusy(
  data: unknown,
  calendarId: string,
): Result<Interval[], CalendarError> {
  const parsed = FreeBusyAnswer.safeParse(data)
  if (!parsed.success) return err({ code: 'unavailable' })
  const entry =
    parsed.data.calendars[calendarId] ??
    Object.entries(parsed.data.calendars).find(
      ([id]) => id.toLowerCase() === calendarId.toLowerCase(),
    )?.[1]
  if (!entry) return err({ code: 'unavailable' })
  if (entry.errors?.length) {
    return err({
      code: entry.errors.some((error) => error.reason === 'notFound') ? 'not-found' : 'unavailable',
    })
  }
  return ok(
    (entry.busy ?? []).map(({ start, end }) => ({ start: new Date(start), end: new Date(end) })),
  )
}

const WatchAnswer = z.object({
  id: z.string().min(1),
  resourceId: z.string().min(1),
  expiration: z.coerce.number().int().positive(),
})

/** The channel Google opened, and when it ends. */
export function watchFrom(data: unknown): Result<CalendarWatch, CalendarError> {
  const parsed = WatchAnswer.safeParse(data)
  if (!parsed.success) return err({ code: 'unavailable' })
  return ok({
    channelId: parsed.data.id,
    resourceId: parsed.data.resourceId,
    expiresAt: new Date(parsed.data.expiration),
  })
}

/**
 * The longest stretch asked of free/busy at once. Google documents no limit, but long ranges
 * have been refused; a booking horizon longer than this is read in pieces.
 */
export const FREE_BUSY_MAX_DAYS = 60

/** The window cut into pieces of at most `maxDays`, in order. */
export function freeBusyChunks(window: Interval, maxDays = FREE_BUSY_MAX_DAYS): Interval[] {
  const chunks: Interval[] = []
  let start = window.start
  while (start < window.end) {
    const end = min([addDays(start, maxDays), window.end])
    chunks.push({ start, end })
    start = end
  }
  return chunks
}
