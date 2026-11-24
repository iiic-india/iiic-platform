import { createEvents, type EventAttributes, type HeaderAttributes } from 'ics'

import { err, ok } from '@/lib/result'

import { calendarEventFor, inviteUid, placeOf, type CalendarBookingView } from './bookingEvent'
import type { BuildFeed, BuildInvite, InviteInput } from './invites'

/**
 * The client's invite and the practitioners' private feeds (D-22; docs/16 §7), written by the
 * `ics` library (pinned), never by hand. Instants are written in UTC (`…Z`), which every
 * calendar reads the same way and shows in its own zone. An invite keeps one UID for the
 * booking's whole life (`<first reference>@<host>`), raises SEQUENCE on each change and sends
 * METHOD:CANCEL with STATUS:CANCELLED on cancellation, which is how Google, Apple and Outlook
 * know to move or remove the event they already hold (RFC 5546). Nothing here holds a price
 * (D-21) or anything said in a session (CLAUDE.md #3).
 */

const PRODUCT_ID = '-//Indian Institute of Image Catalysts//Bookings//EN'
const FEED_NAME = 'IIIC bookings'

/**
 * Who sends and who receives the invite. RFC 5546 asks a REQUEST and a CANCEL to name both, and
 * Gmail and Outlook treat an invite as an update or a cancellation only when they do. The
 * organizer is the address the confirmation is sent from (M6); the client is the only attendee
 * and is not asked to reply.
 */
export type InviteParties = {
  organizer?: { name: string; email: string }
  attendee?: { name?: string; email: string }
}

type Failure = { ok: false; error: { code: 'invalid-invite' } }
const invalid = (): Failure => err({ code: 'invalid-invite' })

/** The library's answer as a typed result; its error text is never passed on or logged. */
function written(events: EventAttributes[], header: HeaderAttributes) {
  const { error, value } = createEvents(events, header)
  return error || !value ? invalid() : ok(value)
}

const timeOf = (date: Date) => ({
  start: date.getTime(),
  startInputType: 'utc' as const,
  startOutputType: 'utc' as const,
})

const endOf = (date: Date) => ({
  end: date.getTime(),
  endInputType: 'utc' as const,
  endOutputType: 'utc' as const,
})

/** One booking as an `.ics` invite (B2, B7), with the parties when the sender names them. */
export const buildInvite = ((input: InviteInput & InviteParties) => {
  if (!Number.isFinite(input.start.getTime()) || !Number.isFinite(input.end.getTime())) {
    return invalid()
  }
  const cancelled = input.method === 'CANCEL'
  const event: EventAttributes = {
    uid: input.uid,
    sequence: input.sequence,
    ...timeOf(input.start),
    ...endOf(input.end),
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    ...(input.location ? { location: input.location } : {}),
    ...(input.url ? { url: input.url } : {}),
    status: cancelled ? 'CANCELLED' : 'CONFIRMED',
    ...(input.organizer ? { organizer: input.organizer } : {}),
    ...(input.attendee
      ? {
          attendees: [
            {
              ...input.attendee,
              rsvp: false,
              partstat: 'ACCEPTED' as const,
              role: 'REQ-PARTICIPANT' as const,
            },
          ],
        }
      : {}),
  }
  return written([event], { productId: PRODUCT_ID, method: input.method })
}) satisfies BuildInvite

/** A practitioner's own bookings as a feed their calendar subscribes to (`/api/calendar/feed`). */
export const buildFeed: BuildFeed = (events) => {
  if (events.some((event) => !Number.isFinite(event.start.getTime()))) return invalid()
  return written(
    events.map((event) => ({
      uid: event.uid,
      ...timeOf(event.start),
      ...endOf(event.end),
      title: event.title,
      ...(event.description ? { description: event.description } : {}),
      ...(event.location ? { location: event.location } : {}),
      ...(event.url ? { url: event.url } : {}),
      status: 'CONFIRMED' as const,
      // The entry names a client: a calendar shared with others shows it as busy only.
      classification: 'PRIVATE',
    })),
    { productId: PRODUCT_ID, method: 'PUBLISH', calName: FEED_NAME },
  )
}

/**
 * The client's invite for a booking (B2, B7). `rootReference` is the reference of the first
 * booking in its chain of reschedules and `changes` how many reschedules followed, so the UID
 * never changes and SEQUENCE grows with each move; a cancellation takes the next number.
 */
export function clientInvite(input: {
  view: CalendarBookingView
  rootReference: string
  changes: number
  cancelled: boolean
  meetingUrl: string | null
  practitionerName: string | null
  siteUrl: string
}): InviteInput | null {
  const { view } = input
  if (!view.startsAt || !view.endsAt) return null
  const place = placeOf(view)
  const meetingUrl = place === 'online' ? input.meetingUrl : null
  const description = [
    `Booking reference: ${view.reference}`,
    input.practitionerName ? `With ${input.practitionerName}` : null,
    meetingUrl ? `Join on Google Meet: ${meetingUrl}` : null,
  ]
    .filter(Boolean)
    .join('\n')
  return {
    uid: inviteUid(input.rootReference, input.siteUrl),
    sequence: input.cancelled ? input.changes + 1 : input.changes,
    method: input.cancelled ? 'CANCEL' : 'REQUEST',
    start: view.startsAt,
    end: view.endsAt,
    title: view.serviceName,
    description,
    location: place === 'office' ? view.officeAddress : null,
    url: meetingUrl,
  }
}

/** One booking in a practitioner's feed: the same words as their Google Calendar entry. */
export function feedEvent(
  view: CalendarBookingView,
  meetingUrl: string | null,
  siteUrl: string,
): Omit<InviteInput, 'method' | 'sequence'> | null {
  const event = calendarEventFor(view)
  if (!event) return null
  return {
    uid: inviteUid(view.reference, siteUrl),
    start: event.start,
    end: event.end,
    title: event.title,
    description: '',
    location: event.location,
    url: event.meet ? meetingUrl : null,
  }
}
