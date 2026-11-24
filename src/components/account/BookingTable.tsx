import Link from 'next/link'

import { MANAGE_COPY } from '@/components/booking/copy'
import type { AccountBooking } from '@/lib/accounts/contract'
import { whenOf } from '@/lib/bookingFlow/format'

import { BOOKINGS_COPY } from './copy'
import { TableRegion } from './TableRegion'

/**
 * A list of bookings as a real table (docs/20 §7.2; src/brand/gallery.html, "Table"): the
 * reference, which opens the booking, what, when in India, and the status. An empty list says
 * what will appear here.
 */
export function BookingTable({
  bookings,
  label,
  empty,
}: {
  bookings: AccountBooking[]
  label: string
  empty: string
}) {
  if (!bookings.length) return <p>{empty}</p>
  return (
    <TableRegion label={label}>
      <table className="iiic-table">
        <thead>
          <tr>
            <th scope="col">{BOOKINGS_COPY.columns.booking}</th>
            <th scope="col">{BOOKINGS_COPY.columns.what}</th>
            <th scope="col">{BOOKINGS_COPY.columns.when}</th>
            <th scope="col">{BOOKINGS_COPY.columns.status}</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((booking) => (
            <tr key={booking.id}>
              <td>
                <Link
                  className="iiic-link"
                  href={`/account/bookings/${encodeURIComponent(booking.reference)}`}
                  prefetch={false}
                >
                  {booking.reference}
                </Link>
              </td>
              <td>{booking.serviceName}</td>
              <td>
                {booking.startsAt
                  ? whenOf(booking.startsAt.toISOString())
                  : BOOKINGS_COPY.noTimeYet}
              </td>
              <td>{MANAGE_COPY.status[booking.status] ?? booking.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableRegion>
  )
}
