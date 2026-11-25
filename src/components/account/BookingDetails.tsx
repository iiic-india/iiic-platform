import { CONFIRMED_COPY, MANAGE_COPY } from '@/components/booking/copy'
import type { AccountBooking } from '@/lib/accounts/contract'
import { whenOf } from '@/lib/bookingFlow/format'

import { BOOKING_COPY, BOOKINGS_COPY } from './copy'

/** A meeting link is drawn as a link only when it is one: https, nothing that could run. */
export function meetingLink(place: string | null): string | null {
  if (!place) return null
  try {
    const url = new URL(place)
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/** Where a booking takes place, as its confirmation says it. */
function Where({ booking }: { booking: AccountBooking }) {
  if (booking.format === 'office') return <>{booking.place ?? CONFIRMED_COPY.office}</>
  const link = meetingLink(booking.place)
  return link ? (
    <a className="iiic-link" href={link} rel="noopener noreferrer">
      {BOOKING_COPY.joinOnline}
    </a>
  ) : (
    <>{CONFIRMED_COPY.online}</>
  )
}

/**
 * One booking as its confirmation shows it (docs/20 §7.2; src/app/(platform)/(booking)/book/
 * confirmed/[ref]/page.tsx): the reference, the status, what, when in India, where (the meeting
 * link while it is confirmed and ahead, or the office), with whom, and "Add to your calendar"
 * for a confirmed booking with a time. Nothing else: no price, no offer (D-21, D-124).
 */
export function BookingDetails({
  booking,
  option,
}: {
  booking: AccountBooking
  option?: { label: string | null; minutes: number | null }
}) {
  const what = [
    booking.serviceName,
    option?.label,
    option?.minutes ? `${option.minutes} minutes` : null,
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <>
      <dl>
        <dt>{CONFIRMED_COPY.reference}</dt>
        <dd>
          <strong>{booking.reference}</strong>
        </dd>
        <dt>{MANAGE_COPY.statusLabel}</dt>
        <dd>{MANAGE_COPY.status[booking.status] ?? booking.status}</dd>
        {what ? (
          <>
            <dt>{CONFIRMED_COPY.what}</dt>
            <dd>{what}</dd>
          </>
        ) : null}
        <dt>{CONFIRMED_COPY.when}</dt>
        <dd>
          {booking.startsAt ? whenOf(booking.startsAt.toISOString()) : BOOKINGS_COPY.noTimeYet}
        </dd>
        {booking.format ? (
          <>
            <dt>{CONFIRMED_COPY.where}</dt>
            <dd>
              <Where booking={booking} />
            </dd>
          </>
        ) : null}
        {booking.practitionerName ? (
          <>
            <dt>{CONFIRMED_COPY.with}</dt>
            <dd>{booking.practitionerName}</dd>
          </>
        ) : null}
      </dl>
      {booking.status === 'confirmed' && booking.startsAt ? (
        <p>
          <a
            className="iiic-link"
            href={`/account/bookings/${encodeURIComponent(booking.reference)}/invite.ics`}
          >
            {CONFIRMED_COPY.addToCalendar}
          </a>
        </p>
      ) : null}
    </>
  )
}
