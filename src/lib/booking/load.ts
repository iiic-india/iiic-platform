import 'server-only'

import { subDays } from 'date-fns'
import type { PayloadRequest } from 'payload'

import type { Weekday } from '@/fields/workingSpans'
import type { Booking, Practitioner, Service } from '@/payload-types'

import { resolveRules, rulesFromService, rulesFromSettings } from './policies'
import { atIst, horizonLastDay, istDayOf, nextIstDay } from './slots'
import { SLOT_BLOCKING_STATUSES } from './states'
import type { BookingRules, DayException, Interval, MissingRule, WeeklyHours } from './types'

/**
 * What the booking operations read, on the server, past the collections' access rules (the
 * operations check who is asking themselves): the service and its option, the practitioner, the
 * rules, and a practitioner's hours, exceptions, busy times and bookings for the slot engine.
 * Every read joins the request's transaction.
 */

/** The kinds of booking that take a practitioner's time through the slot engine. */
export const SLOT_TYPES = ['session', 'call'] as const
export type SlotType = (typeof SLOT_TYPES)[number]

/** The states of a hold, which lapse at `holdExpiresAt`. */
export const HOLD_STATUSES = ['held', 'pendingPayment'] as const

export type ServiceOption = { id: string; label: string | null; durationMinutes: number }

export async function loadService(req: PayloadRequest, id: number): Promise<Service | null> {
  return req.payload
    .findByID({ collection: 'services', id, depth: 0, overrideAccess: true, req })
    .catch(() => null)
}

/** A service's option by its row id, with a whole length in minutes; null when there is none. */
export function optionOf(service: Service, optionId: string): ServiceOption | null {
  const option = service.options?.find((entry) => entry.id === optionId)
  const minutes = option?.duration
  if (!option?.id || typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes <= 0) {
    return null
  }
  return { id: option.id, label: option.label ?? null, durationMinutes: minutes }
}

/** A service a client can book a time with now: offered, and of a kind that takes a time. */
export function isSlotService(service: Service | null): service is Service & { type: SlotType } {
  return Boolean(service?.active) && (SLOT_TYPES as readonly string[]).includes(service?.type ?? '')
}

export async function loadPractitioner(
  req: PayloadRequest,
  id: number,
): Promise<Practitioner | null> {
  return req.payload
    .findByID({ collection: 'practitioners', id, depth: 0, overrideAccess: true, req })
    .catch(() => null)
}

/** Whether a practitioner's profile is active and offers the service. */
export function offers(practitioner: Practitioner | null, serviceId: number): boolean {
  if (!practitioner?.active) return false
  return (practitioner.services ?? []).some(
    (service) => (typeof service === 'number' ? service : service.id) === serviceId,
  )
}

export async function loadBooking(req: PayloadRequest, id: number): Promise<Booking | null> {
  return req.payload
    .findByID({ collection: 'bookings', id, depth: 0, overrideAccess: true, req })
    .catch(() => null)
}

/** The rules a service books by: its own, else the defaults in Settings (docs/16 §6). */
export async function loadRules(
  req: PayloadRequest,
  service: Service,
): Promise<{ ok: true; value: BookingRules } | { ok: false; error: MissingRule }> {
  const settings = await req.payload.findGlobal({
    slug: 'settings',
    select: { booking: true },
    depth: 0,
    overrideAccess: true,
    req,
  })
  return resolveRules(rulesFromService(service.bookingRules), rulesFromSettings(settings))
}

/** Whether a practitioner's calendar is connected, without which no time is offered (docs/16 §7). */
export async function calendarConnected(
  req: PayloadRequest,
  practitionerId: number,
): Promise<boolean> {
  const { totalDocs } = await req.payload.count({
    collection: 'calendar-connections',
    where: {
      and: [{ practitioner: { equals: practitionerId } }, { status: { equals: 'connected' } }],
    },
    overrideAccess: true,
    req,
  })
  return totalDocs > 0
}

const idOf = (value: unknown) =>
  typeof value === 'number' ? value : (value as { id?: number } | null)?.id

/** The window the engine looks at: from a day before now to the day after the horizon ends. */
export function engineWindow(now: Date, horizonDays: number): Interval {
  return {
    start: subDays(now, 1),
    end: atIst(nextIstDay(horizonLastDay(now, horizonDays)), '00:00'),
  }
}

export type Availability = {
  hours: WeeklyHours[]
  exceptions: DayException[]
  /** Busy times from the practitioner's calendar. */
  busy: Interval[]
  /** Their bookings that keep time taken, lapsed holds left out. */
  booked: Interval[]
}

/**
 * A practitioner's hours, exceptions, busy times and active bookings in a window. A hold past its
 * time no longer takes the time, even before the sweep (B4) marks it expired. `except` leaves one
 * booking out: the one being moved.
 */
export async function loadAvailability(
  req: PayloadRequest,
  input: { practitionerId: number; window: Interval; now: Date; except?: number },
): Promise<Availability> {
  const { practitionerId, window, now } = input
  const firstDay = istDayOf(window.start)
  const lastDay = istDayOf(window.end)
  const [rules, exceptions, busy, bookings] = await Promise.all([
    req.payload.find({
      collection: 'availability-rules',
      where: { practitioner: { equals: practitionerId } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
    }),
    req.payload.find({
      collection: 'availability-exceptions',
      where: {
        and: [
          { practitioner: { equals: practitionerId } },
          { day: { greater_than_equal: firstDay } },
          { day: { less_than_equal: lastDay } },
        ],
      },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
    }),
    req.payload.find({
      collection: 'busy-blocks',
      where: {
        and: [
          { practitioner: { equals: practitionerId } },
          { startsAt: { less_than: window.end.toISOString() } },
          { endsAt: { greater_than: window.start.toISOString() } },
        ],
      },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
    }),
    req.payload.find({
      collection: 'bookings',
      where: {
        and: [
          { practitioner: { equals: practitionerId } },
          { status: { in: [...SLOT_BLOCKING_STATUSES] } },
          { startsAt: { less_than: window.end.toISOString() } },
          { endsAt: { greater_than: window.start.toISOString() } },
          ...(input.except === undefined ? [] : [{ id: { not_equals: input.except } }]),
        ],
      },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
    }),
  ])

  const interval = (from?: string | null, to?: string | null): Interval[] =>
    from && to ? [{ start: new Date(from), end: new Date(to) }] : []
  const lapsed = (booking: Booking) =>
    (HOLD_STATUSES as readonly string[]).includes(booking.status) &&
    Boolean(booking.holdExpiresAt) &&
    new Date(booking.holdExpiresAt as string) <= now

  return {
    hours: rules.docs.map((rule) => ({
      weekday: rule.weekday as Weekday,
      spans: (rule.spans ?? []).map((span) => ({ start: span.start, end: span.end })),
      validFrom: rule.validFrom,
      validTo: rule.validTo ?? null,
    })),
    exceptions: exceptions.docs.map((exception): DayException =>
      exception.kind === 'closed'
        ? { day: exception.day, kind: 'closed' }
        : {
            day: exception.day,
            kind: 'customHours',
            spans: (exception.spans ?? []).map((span) => ({ start: span.start, end: span.end })),
          },
    ),
    busy: busy.docs.flatMap((block) => interval(block.startsAt, block.endsAt)),
    booked: bookings.docs
      .filter((booking) => !lapsed(booking))
      .flatMap((booking) => interval(booking.startsAt, booking.endsAt)),
  }
}

/**
 * What a client has paid towards a booking, net of refunds, in paise: the captured payments on
 * it and on the bookings it replaced (a reschedule keeps the payment on the first booking).
 */
export async function paidPaiseFor(req: PayloadRequest, booking: Booking): Promise<number> {
  const chain: number[] = [booking.id]
  let from = idOf(booking.rescheduledFrom)
  while (from !== undefined && !chain.includes(from) && chain.length < 50) {
    chain.push(from)
    const previous = await loadBooking(req, from)
    from = previous ? idOf(previous.rescheduledFrom) : undefined
  }
  const payments = await req.payload.find({
    collection: 'payments',
    where: {
      and: [{ booking: { in: chain } }, { status: { in: ['captured', 'partRefunded'] } }],
    },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  return payments.docs.reduce(
    (sum, payment) => sum + Math.max(0, payment.amountPaise - (payment.refundedPaise ?? 0)),
    0,
  )
}
