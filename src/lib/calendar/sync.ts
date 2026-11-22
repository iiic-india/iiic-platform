import 'server-only'

import { randomUUID } from 'node:crypto'

import { addHours } from 'date-fns'
import { commitTransaction, initTransaction, killTransaction, type PayloadRequest } from 'payload'

import type { Interval } from '@/lib/booking/types'
import { err, ok, type Result } from '@/lib/result'
import { readLegalInformation } from '@/lib/settings/source'
import { IST } from '@/lib/time/ist'
import type { Booking, CalendarConnection } from '@/payload-types'

import {
  bookingView,
  calendarActionFor,
  calendarEventFor,
  type CalendarBookingView,
} from './bookingEvent'
import { busyWindow, longestHorizon, normaliseBusy } from './busy'
import type { CalendarDeps } from './config'
import type { CalendarError, CalendarEventRef, CalendarProvider } from './provider'
import { CALENDAR_SYNC_CONTEXT } from './queue'
import { CHANNEL_TOKEN_BYTES, hashToken, newToken } from './tokens'

/**
 * The calendar's work against the database (D-22, B2, B7, B14; docs/16 §7): a confirmed booking
 * written to its practitioner's calendar, moved on a reschedule and removed on a cancellation;
 * busy times read in; watch channels kept open. Each function takes the calendar it runs with
 * (calendarFor.ts gives the server's own; tests pass a FakeCalendar), runs in the request's
 * transaction, and is safe to run again: the jobs retry it.
 *
 * Without a calendar (no settings) a step that would reach one answers `not-configured` and
 * changes nothing; a booking never depends on its calendar entry. Nothing here is logged: the
 * jobs log outcome codes only.
 */

type Ref = number | { id: number } | null | undefined
const idOf = (value: Ref): number | null =>
  typeof value === 'number' ? value : (value?.id ?? null)

/** A connection the platform reads and writes: connected, or failing and still tried. */
const reachable = (
  connection: CalendarConnection | null,
): connection is CalendarConnection & { status: 'connected' | 'failing' } =>
  connection?.status === 'connected' || connection?.status === 'failing'

async function loadBooking(req: PayloadRequest, id: number): Promise<Booking | null> {
  return req.payload.findByID({
    collection: 'bookings',
    id,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
    req,
  })
}

async function connectionOf(
  req: PayloadRequest,
  practitionerId: number,
): Promise<CalendarConnection | null> {
  const { docs } = await req.payload.find({
    collection: 'calendar-connections',
    where: { practitioner: { equals: practitionerId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return docs[0] ?? null
}

/** The booking as the calendar may see it: service name, first name, office address. */
async function viewOf(req: PayloadRequest, booking: Booking): Promise<CalendarBookingView> {
  const serviceId = idOf(booking.service)
  const personId = idOf(booking.person)
  const service = serviceId
    ? await req.payload.findByID({
        collection: 'services',
        id: serviceId,
        select: { name: true, format: true },
        depth: 0,
        overrideAccess: true,
        disableErrors: true,
        req,
      })
    : null
  const client = personId
    ? await req.payload.findByID({
        collection: 'people',
        id: personId,
        select: { fullName: true },
        depth: 0,
        overrideAccess: true,
        disableErrors: true,
        req,
      })
    : null
  const legal = await readLegalInformation(req.payload)
  return bookingView({ booking, service, client, officeAddress: legal.address ?? null })
}

/** Records the calendar's health on its connection, writing only when it changes. */
async function noteHealth(
  req: PayloadRequest,
  connection: CalendarConnection,
  failure: CalendarError | null,
  extra: Partial<CalendarConnection> = {},
): Promise<void> {
  const data: Partial<CalendarConnection> = { ...extra }
  if (!failure) {
    if (connection.status === 'failing') data.status = 'connected'
    if (connection.lastError) data.lastError = null
  } else if (failure.code === 'forbidden' || failure.code === 'not-found') {
    // The calendar itself is out of reach (delegation missing, calendar gone): staff must look.
    if (connection.status !== 'failing') data.status = 'failing'
    if (connection.lastError !== failure.code) data.lastError = failure.code
  } else if (connection.lastError !== failure.code) {
    data.lastError = failure.code
  }
  if (Object.keys(data).length === 0) return
  await req.payload.update({
    collection: 'calendar-connections',
    id: connection.id,
    data,
    overrideAccess: true,
    context: CALENDAR_SYNC_CONTEXT,
    req,
  })
}

type Predecessor = { practitionerId: number | null; calendarEventId: string | null }

async function predecessorOf(req: PayloadRequest, booking: Booking): Promise<Predecessor | null> {
  const id = idOf(booking.rescheduledFrom)
  if (!id) return null
  const before = await loadBooking(req, id)
  if (!before) return null
  return {
    practitionerId: idOf(before.practitioner),
    calendarEventId: before.calendarEventId ?? null,
  }
}

/** Removes one entry from a practitioner's calendar; an entry already gone counts as removed. */
async function removeFrom(
  provider: CalendarProvider,
  req: PayloadRequest,
  practitionerId: number,
  eventId: string,
): Promise<Result<void, CalendarError>> {
  const connection = await connectionOf(req, practitionerId)
  if (!reachable(connection)) return ok(undefined)
  const removed = await provider.deleteEvent(connection.calendarId, eventId)
  if (!removed.ok && removed.error.code !== 'not-found') {
    await noteHealth(req, connection, removed.error)
    return removed
  }
  return ok(undefined)
}

async function saveOnBooking(
  req: PayloadRequest,
  booking: Booking,
  data: { calendarEventId: string | null; meetingUrl?: string | null },
): Promise<void> {
  const sameEvent = (booking.calendarEventId ?? null) === data.calendarEventId
  const sameLink = data.meetingUrl === undefined || (booking.meetingUrl ?? null) === data.meetingUrl
  if (sameEvent && sameLink) return
  await req.payload.update({
    collection: 'bookings',
    id: booking.id,
    data,
    overrideAccess: true,
    context: CALENDAR_SYNC_CONTEXT,
    req,
  })
}

async function writeEvent(
  provider: CalendarProvider,
  req: PayloadRequest,
  booking: Booking,
  practitionerId: number,
  predecessor: Predecessor | null,
): Promise<Result<CalendarEventRef | null, CalendarError>> {
  const input = calendarEventFor(await viewOf(req, booking))
  if (!input) return ok(null)
  const connection = await connectionOf(req, practitionerId)
  if (!reachable(connection)) return ok(null)

  const samePractitioner = predecessor?.practitionerId === practitionerId
  // A reschedule to another practitioner: the old entry leaves the old calendar first.
  if (
    !booking.calendarEventId &&
    !samePractitioner &&
    predecessor?.calendarEventId &&
    predecessor.practitionerId
  ) {
    const removed = await removeFrom(
      provider,
      req,
      predecessor.practitionerId,
      predecessor.calendarEventId,
    )
    if (!removed.ok) return removed
  }

  // The entry this booking already has, or the one it takes over from the booking it replaced.
  const eventId =
    booking.calendarEventId ?? (samePractitioner ? predecessor?.calendarEventId : null) ?? null
  let written = eventId
    ? await provider.updateEvent(connection.calendarId, eventId, input)
    : await provider.createEvent(connection.calendarId, input)
  if (!written.ok && written.error.code === 'not-found' && eventId) {
    // Deleted by hand in the calendar: the booking still stands, so it is written again.
    written = await provider.createEvent(connection.calendarId, input)
  }
  if (!written.ok) {
    await noteHealth(req, connection, written.error)
    return written
  }
  await noteHealth(req, connection, null)
  const meetingUrl = input.meet ? written.value.meetUrl : null
  await saveOnBooking(req, booking, { calendarEventId: written.value.eventId, meetingUrl })
  // Google makes a Meet link a moment after the event; the retry reads it.
  if (input.meet && !meetingUrl) return err({ code: 'unavailable' })
  return ok(written.value)
}

async function removeEvent(
  provider: CalendarProvider,
  req: PayloadRequest,
  booking: Booking,
  practitionerId: number | null,
  predecessor: Predecessor | null,
): Promise<Result<null, CalendarError>> {
  // The entry is the booking's own, or, when the booking was cancelled before its entry moved,
  // still the one of the booking it replaced.
  const target =
    practitionerId && booking.calendarEventId
      ? { practitionerId, eventId: booking.calendarEventId }
      : !booking.calendarEventId && predecessor?.practitionerId && predecessor.calendarEventId
        ? { practitionerId: predecessor.practitionerId, eventId: predecessor.calendarEventId }
        : null
  if (!target) return ok(null)
  const removed = await removeFrom(provider, req, target.practitionerId, target.eventId)
  if (!removed.ok) return removed
  await saveOnBooking(req, booking, { calendarEventId: null })
  return ok(null)
}

/**
 * SyncBookingEvent (provider.ts) with a given calendar: writes a confirmed booking to its
 * practitioner's calendar (B2), moves the entry of the booking it replaced (B7, same
 * practitioner) or moves it across (another practitioner), and removes the entry of a cancelled
 * booking or a lapsed hold. A booking without a practitioner (a fixed-time session), without a
 * time, or whose practitioner has no connected calendar has no entry, and that is not a failure.
 */
export async function syncBookingEventWith(
  deps: CalendarDeps,
  req: PayloadRequest,
  input: { bookingId: number },
): Promise<Result<CalendarEventRef | null, CalendarError>> {
  const booking = await loadBooking(req, input.bookingId)
  if (!booking) return err({ code: 'not-found' })
  const action = calendarActionFor(booking.status)
  if (action === 'none') return ok(null)
  const practitionerId = idOf(booking.practitioner)
  if (action === 'write' && !practitionerId) return ok(null)
  if (!deps.provider.ok) return err({ code: 'not-configured' })
  const predecessor = await predecessorOf(req, booking)
  return action === 'write' && practitionerId
    ? writeEvent(deps.provider.value, req, booking, practitionerId, predecessor)
    : removeEvent(deps.provider.value, req, booking, practitionerId, predecessor)
}

/** The longest booking horizon in force: the settings' and every active service's. */
async function horizonOf(req: PayloadRequest): Promise<number | null> {
  const settings = await req.payload.findGlobal({
    slug: 'settings',
    select: { booking: true },
    depth: 0,
    overrideAccess: true,
    req,
  })
  const { docs } = await req.payload.find({
    collection: 'services',
    where: { active: { equals: true } },
    select: { bookingRules: true },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return longestHorizon([
    settings.booking?.horizonDays,
    ...docs.map((service) => service.bookingRules?.horizonDays),
  ])
}

const keyOf = (start: Date | string, end: Date | string) =>
  `${new Date(start).toISOString()}|${new Date(end).toISOString()}`

/**
 * Makes a practitioner's busy blocks exactly `blocks`, in one transaction: those no longer busy
 * (and those already past) go, new ones are added, unchanged ones stay.
 */
async function replaceBlocks(
  req: PayloadRequest,
  practitionerId: number,
  blocks: readonly Interval[],
): Promise<void> {
  const owned = await initTransaction(req)
  try {
    const { docs } = await req.payload.find({
      collection: 'busy-blocks',
      where: { practitioner: { equals: practitionerId } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      req,
    })
    const wanted = new Map(blocks.map((block) => [keyOf(block.start, block.end), block]))
    const stale = docs.filter((doc) => !wanted.delete(keyOf(doc.startsAt, doc.endsAt)))
    if (stale.length) {
      await req.payload.delete({
        collection: 'busy-blocks',
        where: { id: { in: stale.map((doc) => doc.id) } },
        overrideAccess: true,
        req,
      })
    }
    for (const block of wanted.values()) {
      await req.payload.create({
        collection: 'busy-blocks',
        data: {
          practitioner: practitionerId,
          startsAt: block.start.toISOString(),
          startsAt_tz: IST,
          endsAt: block.end.toISOString(),
          endsAt_tz: IST,
          source: 'google',
        },
        overrideAccess: true,
        req,
      })
    }
    if (owned) await commitTransaction(req)
  } catch (error) {
    if (owned) await killTransaction(req)
    throw error
  }
}

/**
 * RefreshBusyBlocks (provider.ts) with a given calendar (B14): reads the practitioner's busy
 * times for [now, the end of the longest horizon's last day] from free/busy (start and end only,
 * D-22) and makes their blocks match. A practitioner with no connected calendar has none to
 * read; with no horizon set anywhere, no window is guessed and nothing is read.
 */
export async function refreshBusyBlocksWith(
  deps: CalendarDeps,
  req: PayloadRequest,
  input: { practitionerId: number; now: Date },
): Promise<Result<{ blocks: number }, CalendarError>> {
  const connection = await connectionOf(req, input.practitionerId)
  if (!reachable(connection)) return ok({ blocks: 0 })
  if (!deps.provider.ok) return err({ code: 'not-configured' })
  const horizon = await horizonOf(req)
  if (horizon === null) return ok({ blocks: 0 })
  const window = busyWindow(input.now, horizon)
  const read = await deps.provider.value.freeBusy(connection.calendarId, window)
  if (!read.ok) {
    await noteHealth(req, connection, read.error)
    return read
  }
  const blocks = normaliseBusy(read.value, window)
  await replaceBlocks(req, input.practitionerId, blocks)
  await noteHealth(req, connection, null, { lastSyncedAt: input.now.toISOString() })
  return ok({ blocks: blocks.length })
}

/** A channel is renewed when it has less than this left (Google's last about a week). */
export const RENEW_BEFORE_HOURS = 24

export type WatchOutcome = 'renewed' | 'current' | 'off'

/**
 * Keeps a change-notification channel open on a connected calendar (B14): opens a new one when
 * there is none or the current one ends within RENEW_BEFORE_HOURS, keeps only its token's hash,
 * then stops the old one (if Google refuses, it runs out by itself and its notifications are
 * ignored). Off without a webhook address.
 */
export async function renewWatchWith(
  deps: CalendarDeps,
  req: PayloadRequest,
  connection: CalendarConnection,
  now: Date,
): Promise<Result<WatchOutcome, CalendarError>> {
  if (!deps.webhookAddress || !reachable(connection)) return ok('off')
  if (!deps.provider.ok) return err({ code: 'not-configured' })
  const provider = deps.provider.value
  const ends = connection.watch?.expiresAt ? new Date(connection.watch.expiresAt) : null
  if (ends && ends > addHours(now, RENEW_BEFORE_HOURS)) return ok('current')
  const token = newToken(CHANNEL_TOKEN_BYTES)
  const opened = await provider.watch(connection.calendarId, {
    channelId: randomUUID(),
    token,
    address: deps.webhookAddress,
  })
  if (!opened.ok) {
    await noteHealth(req, connection, opened.error)
    return opened
  }
  await req.payload.update({
    collection: 'calendar-connections',
    id: connection.id,
    data: {
      watch: {
        channelId: opened.value.channelId,
        resourceId: opened.value.resourceId,
        expiresAt: opened.value.expiresAt.toISOString(),
      },
      channelTokenHash: hashToken(token),
    },
    overrideAccess: true,
    context: CALENDAR_SYNC_CONTEXT,
    req,
  })
  await stopChannel(provider, connection)
  return ok('renewed')
}

/** Stops a connection's channel, best effort; Google needs the calendar that opened it. */
async function stopChannel(provider: CalendarProvider, connection: CalendarConnection) {
  const { channelId, resourceId } = connection.watch ?? {}
  if (!channelId || !resourceId) return
  const channel = { channelId, resourceId, calendarId: connection.calendarId }
  await provider.stopWatch(channel)
}

export type SweepOutcome =
  | { outcome: 'not-configured' }
  | { outcome: 'done'; refreshed: number; failed: number; renewed: number; stopped: number }

/**
 * The 15-minute sweep (B14), the fallback to change notifications: every connected or failing
 * calendar's busy times are read again and its channel renewed when due; a paused calendar's
 * channel is stopped and forgotten. One calendar's failure never stops the others.
 */
export async function sweepCalendarsWith(
  deps: CalendarDeps,
  req: PayloadRequest,
  now: Date,
): Promise<SweepOutcome> {
  if (!deps.provider.ok) return { outcome: 'not-configured' }
  const provider = deps.provider.value
  const { docs } = await req.payload.find({
    collection: 'calendar-connections',
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const tally = { refreshed: 0, failed: 0, renewed: 0, stopped: 0 }
  for (const connection of docs) {
    const practitionerId = idOf(connection.practitioner)
    if (!practitionerId) continue
    if (!reachable(connection)) {
      if (connection.watch?.channelId) {
        await stopChannel(provider, connection)
        await req.payload.update({
          collection: 'calendar-connections',
          id: connection.id,
          data: {
            watch: { channelId: null, resourceId: null, expiresAt: null },
            channelTokenHash: null,
          },
          overrideAccess: true,
          context: CALENDAR_SYNC_CONTEXT,
          req,
        })
        tally.stopped += 1
      }
      continue
    }
    const refreshed = await refreshBusyBlocksWith(deps, req, { practitionerId, now })
    if (refreshed.ok) tally.refreshed += 1
    else tally.failed += 1
    // The refresh may have changed the connection's health: read it as it now stands.
    const current = await connectionOf(req, practitionerId)
    if (current) {
      const renewed = await renewWatchWith(deps, req, current, now)
      if (renewed.ok && renewed.value === 'renewed') tally.renewed += 1
    }
  }
  return { outcome: 'done', ...tally }
}
