import type { BookingStatus } from '@/lib/booking/states'
import type { Booking, Person, Service } from '@/payload-types'

import type { CalendarEventInput } from './provider'

/**
 * What a booking puts in its practitioner's calendar (D-22; docs/16 §1, §7; docs/08 §8), worked
 * out without the database: the time, the service's name, the client's first name, the
 * reference, and a Meet link (online) or the office address. Nothing else reaches Google: no
 * surname, contact detail, time request, note, company, age band or price, and the client is
 * never a guest (their invite is the platform's own `.ics`). Counselling is private
 * (CLAUDE.md #3), so every kind of booking is held to this one rule.
 */

export type BookingForCalendar = Pick<
  Booking,
  'reference' | 'type' | 'format' | 'startsAt' | 'endsAt'
>

/** The parts of a booking the calendar may use, and nothing more. */
export type CalendarBookingView = {
  reference: string
  type: Booking['type']
  format: 'online' | 'office' | null
  startsAt: Date | null
  endsAt: Date | null
  serviceName: string
  serviceFormat: Service['format'] | null
  clientFirstName: string | null
  /** The office address in the settings (I-33); empty until IIIC enters it. */
  officeAddress: string | null
}

const instant = (value: string | null | undefined): Date | null => {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

/** The first word of the name the client gave, as docs/08 §8 allows on a calendar. */
export function firstName(fullName: string | null | undefined): string | null {
  const first = fullName?.trim().split(/\s+/)[0]
  return first ? first : null
}

/** Picks out of a booking, its service and its client what a calendar may show. */
export function bookingView(input: {
  booking: BookingForCalendar
  service: Pick<Service, 'name' | 'format'> | null
  client: Pick<Person, 'fullName'> | null
  officeAddress: string | null
}): CalendarBookingView {
  const { booking, service, client, officeAddress } = input
  return {
    reference: booking.reference,
    type: booking.type,
    format: booking.format ?? null,
    startsAt: instant(booking.startsAt),
    endsAt: instant(booking.endsAt),
    serviceName: service?.name?.trim() ?? '',
    serviceFormat: service?.format ?? null,
    clientFirstName: firstName(client?.fullName),
    officeAddress: officeAddress?.trim() || null,
  }
}

/**
 * Where the booking takes place: as the client chose, else the service's only format; a service
 * offered both ways with no choice recorded names neither (D-03).
 */
export function placeOf(view: CalendarBookingView): 'online' | 'office' | null {
  if (view.format) return view.format
  return view.serviceFormat === 'online' || view.serviceFormat === 'office'
    ? view.serviceFormat
    : null
}

/** The event for the practitioner's calendar, or none while the booking has no time. */
export function calendarEventFor(view: CalendarBookingView): CalendarEventInput | null {
  const { startsAt, endsAt } = view
  if (!startsAt || !endsAt || endsAt <= startsAt) return null
  const place = placeOf(view)
  return {
    reference: view.reference,
    start: startsAt,
    end: endsAt,
    title: [view.serviceName, view.clientFirstName, view.reference].filter(Boolean).join(' · '),
    location: place === 'office' ? view.officeAddress : null,
    meet: place === 'online',
  }
}

export type CalendarAction = 'write' | 'remove' | 'none'

/**
 * What the practitioner's calendar does for a booking in each state (B2, B7): a confirmed one is
 * written; a cancelled one, or a hold that lapsed, is removed; a time request, a hold and a
 * finished booking are left as they are. A rescheduled booking's event is moved by the booking
 * that replaced it.
 */
export function calendarActionFor(status: BookingStatus): CalendarAction {
  switch (status) {
    case 'confirmed':
      return 'write'
    case 'cancelledByClient':
    case 'cancelledByIiic':
    case 'expired':
      return 'remove'
    default:
      return 'none'
  }
}

/**
 * An invite's UID (docs/16 §7): the reference at the platform's host, so every calendar that
 * holds the invite replaces the same event when it changes.
 */
export function inviteUid(reference: string, siteUrl: string): string {
  return `${reference}@${new URL(siteUrl).hostname}`
}
