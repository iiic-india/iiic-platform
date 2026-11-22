import 'server-only'

import { TZDate } from '@date-fns/tz'
import { startOfDay } from 'date-fns'
import type { PayloadRequest } from 'payload'

import type { BookingStatus } from '@/lib/booking/states'
import { err, ok, type Result } from '@/lib/result'
import { readLegalInformation } from '@/lib/settings/source'
import { IST } from '@/lib/time/ist'

import { bookingView } from './bookingEvent'
import { buildFeed, feedEvent } from './ics'
import { withOwnContext } from './queue'
import { FEED_TOKEN_BYTES, FeedToken, hashToken, newToken } from './tokens'

/**
 * A practitioner's private feed of their own bookings (D-22; docs/16 §7): an address with a
 * token of 128 random bits, shown once to the owner who makes it; the connection keeps only its
 * hash. Making a new one replaces the old, and revoking it empties the hash, so the old address
 * answers 404 at once. The feed holds the practitioner's own bookings, from the start of today
 * in India, with the words their Google Calendar entry has (service, first name, reference,
 * Meet link or office address) and nothing else (docs/08 §8, CLAUDE.md #3).
 */

/** The bookings a feed shows: those that take or took the practitioner's time today or later. */
export const FEED_STATUSES = [
  'confirmed',
  'completed',
  'noShow',
] as const satisfies readonly BookingStatus[]

/** More than any practitioner books ahead; the feed stops there. */
const FEED_LIMIT = 500

type Ref = number | { id: number } | null | undefined
const idOf = (value: Ref): number | null =>
  typeof value === 'number' ? value : (value?.id ?? null)

export function feedUrl(siteUrl: string, token: string): string {
  return new URL(`/api/calendar/feed/${token}`, siteUrl).toString()
}

type FeedError = { code: 'not-found' } | { code: 'invalid-invite' }

/** The feed for a token, or `not-found` for a token that is malformed, unknown or revoked. */
export async function practitionerFeed(
  req: PayloadRequest,
  input: { token: string; siteUrl: string; now: Date },
): Promise<Result<string, FeedError>> {
  const token = FeedToken.safeParse(input.token)
  if (!token.success) return err({ code: 'not-found' })
  const { docs: connections } = await req.payload.find({
    collection: 'calendar-connections',
    where: { feedTokenHash: { equals: hashToken(token.data) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const practitionerId = idOf(connections[0]?.practitioner)
  if (!practitionerId) return err({ code: 'not-found' })

  // A practitioner whose staff account has been switched off has no feed (docs/13: leavers).
  const practitioner = await req.payload.findByID({
    collection: 'practitioners',
    id: practitionerId,
    select: { staff: true },
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
    req,
  })
  if (!practitioner) return err({ code: 'not-found' })
  const staffId = idOf(practitioner.staff)
  if (staffId) {
    const staff = await req.payload.findByID({
      collection: 'users',
      id: staffId,
      select: { active: true },
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
      req,
    })
    if (!staff || staff.active === false) return err({ code: 'not-found' })
  }

  const fromToday = startOfDay(new TZDate(input.now.getTime(), IST))
  const { docs: bookings } = await req.payload.find({
    collection: 'bookings',
    where: {
      and: [
        { practitioner: { equals: practitionerId } },
        { status: { in: [...FEED_STATUSES] } },
        { endsAt: { greater_than: new Date(fromToday.getTime()).toISOString() } },
      ],
    },
    sort: 'startsAt',
    limit: FEED_LIMIT,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const serviceIds = [...new Set(bookings.map((booking) => idOf(booking.service)))].filter(
    (id): id is number => id !== null,
  )
  const personIds = [...new Set(bookings.map((booking) => idOf(booking.person)))].filter(
    (id): id is number => id !== null,
  )
  const services = serviceIds.length
    ? (
        await req.payload.find({
          collection: 'services',
          where: { id: { in: serviceIds } },
          select: { name: true, format: true },
          pagination: false,
          depth: 0,
          overrideAccess: true,
          req,
        })
      ).docs
    : []
  const people = personIds.length
    ? (
        await req.payload.find({
          collection: 'people',
          where: { id: { in: personIds } },
          select: { fullName: true },
          pagination: false,
          depth: 0,
          overrideAccess: true,
          req,
        })
      ).docs
    : []
  const serviceOf = new Map(services.map((service) => [service.id, service]))
  const personOf = new Map(people.map((person) => [person.id, person]))
  const officeAddress = (await readLegalInformation(req.payload)).address ?? null

  const events = bookings.flatMap((booking) => {
    const view = bookingView({
      booking,
      service: serviceOf.get(idOf(booking.service) ?? -1) ?? null,
      client: personOf.get(idOf(booking.person) ?? -1) ?? null,
      officeAddress,
    })
    const event = feedEvent(view, booking.meetingUrl ?? null, input.siteUrl)
    return event ? [event] : []
  })
  return buildFeed(events)
}

/**
 * Makes a new feed address for a connection, replacing any earlier one, and returns it: the only
 * time it is shown. The caller has checked the user first (an owner with their code).
 */
export async function issueFeedLink(
  req: PayloadRequest,
  input: { connectionId: number; siteUrl: string },
): Promise<Result<{ url: string }, { code: 'not-found' }>> {
  const token = newToken(FEED_TOKEN_BYTES)
  const changed = await setFeedHash(req, input.connectionId, hashToken(token), 'feed-link-issued')
  return changed ? ok({ url: feedUrl(input.siteUrl, token) }) : err({ code: 'not-found' })
}

/** Revokes a connection's feed address: from now on it answers 404. */
export async function revokeFeedLink(
  req: PayloadRequest,
  input: { connectionId: number },
): Promise<Result<void, { code: 'not-found' }>> {
  const changed = await setFeedHash(req, input.connectionId, null, 'feed-link-revoked')
  return changed ? ok(undefined) : err({ code: 'not-found' })
}

async function setFeedHash(
  req: PayloadRequest,
  connectionId: number,
  feedTokenHash: string | null,
  auditAction: string,
): Promise<boolean> {
  const existing = await req.payload.findByID({
    collection: 'calendar-connections',
    id: connectionId,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
    req,
  })
  if (!existing) return false
  await withOwnContext(req, () =>
    req.payload.update({
      collection: 'calendar-connections',
      id: connectionId,
      data: { feedTokenHash },
      overrideAccess: true,
      // The audit log names what the owner did; the connection hooks leave the feed alone.
      context: { auditAction, calendarSync: true },
      req,
    }),
  )
  return true
}
