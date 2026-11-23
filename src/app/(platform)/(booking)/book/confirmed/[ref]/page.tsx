import type { Metadata } from 'next'

import { Scope } from '@/components/blocks/Scope'
import { CONFIRMED_COPY } from '@/components/booking/copy'
import { RefreshWhilePending } from '@/components/booking/RefreshWhilePending'
import { typeOfReference } from '@/components/booking/registers'
import { hashManageToken } from '@/lib/booking/tokens'
import { whenOf } from '@/lib/bookingFlow/format'
import {
  bookingExists,
  bookingForThisBrowser,
  flowRequest,
  readBookingCookie,
} from '@/lib/bookingFlow/server'

export const metadata: Metadata = {
  title: CONFIRMED_COPY.heading.confirmed,
  robots: { index: false, follow: false },
}

const idOf = (value: number | { id: number } | null | undefined) =>
  value === null || value === undefined ? null : typeof value === 'number' ? value : value.id

/**
 * /book/confirmed/[ref]: step 5 (docs/03 F3; docs/02). The browser that booked sees what it
 * booked, its reference, the calendar invitation and, once, the manage link; anyone else who
 * opens the address learns only that the booking exists (docs/16 §6). No price is shown here.
 * A counselling booking carries the scope statement and the crisis numbers (docs/08 §7).
 */
export default async function ConfirmedPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  const type = typeOfReference(ref)
  const req = await flowRequest()
  const booking = type ? await bookingForThisBrowser(req, ref) : null
  const exists = booking ? true : type ? await bookingExists(req, ref) : false
  const session = type === 'session'

  if (!booking) {
    return (
      <>
        <section className="iiic-section">
          <h1 className="iiic-marked">{CONFIRMED_COPY.heading.other}</h1>
          <p>{exists ? CONFIRMED_COPY.notYours : CONFIRMED_COPY.unknown}</p>
        </section>
        {session ? <Scope /> : null}
      </>
    )
  }

  const status = booking.status
  const pending = status === 'held' || status === 'pendingPayment'
  const heading =
    status === 'confirmed'
      ? CONFIRMED_COPY.heading.confirmed
      : status === 'requested'
        ? CONFIRMED_COPY.heading.requested
        : pending
          ? CONFIRMED_COPY.heading.pending
          : CONFIRMED_COPY.heading.other
  const serviceId = idOf(booking.service)
  const practitionerId = idOf(booking.practitioner)
  const [service, practitioner] = await Promise.all([
    serviceId
      ? req.payload.findByID({
          collection: 'services',
          id: serviceId,
          depth: 0,
          disableErrors: true,
          overrideAccess: true,
          req,
        })
      : null,
    practitionerId
      ? req.payload.findByID({
          collection: 'practitioners',
          id: practitionerId,
          depth: 0,
          disableErrors: true,
          overrideAccess: true,
          req,
        })
      : null,
  ])
  const cookie = await readBookingCookie()
  const manageToken =
    cookie?.token && booking.manageTokenHash === hashManageToken(cookie.token) ? cookie.token : null
  const what = [
    service?.name,
    booking.optionLabel,
    booking.durationMinutes ? `${booking.durationMinutes} minutes` : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <>
      <section className="iiic-section">
        <h1 className="iiic-marked" tabIndex={-1}>
          {heading}
        </h1>
        <p role="status">
          {status === 'confirmed'
            ? CONFIRMED_COPY.confirmed
            : status === 'requested'
              ? CONFIRMED_COPY.requested
              : pending
                ? CONFIRMED_COPY.pending
                : null}
        </p>
        {pending ? <RefreshWhilePending /> : null}
        <div className="iiic-panel">
          <dl>
            <dt>{CONFIRMED_COPY.reference}</dt>
            <dd>
              <strong>{booking.reference}</strong>
            </dd>
            {what ? (
              <>
                <dt>{CONFIRMED_COPY.what}</dt>
                <dd>{what}</dd>
              </>
            ) : null}
            {booking.startsAt ? (
              <>
                <dt>{CONFIRMED_COPY.when}</dt>
                <dd>{whenOf(booking.startsAt)}</dd>
              </>
            ) : null}
            {booking.format ? (
              <>
                <dt>{CONFIRMED_COPY.where}</dt>
                <dd>
                  {booking.format === 'online' ? CONFIRMED_COPY.online : CONFIRMED_COPY.office}
                </dd>
              </>
            ) : null}
            {practitioner ? (
              <>
                <dt>{CONFIRMED_COPY.with}</dt>
                <dd>{practitioner.publicName}</dd>
              </>
            ) : null}
          </dl>
          {status === 'confirmed' && booking.paymentStatus === 'unpaid' ? (
            <p className="iiic-type-small">{CONFIRMED_COPY.unpaidNote}</p>
          ) : null}
          {status === 'confirmed' && booking.startsAt ? (
            <p>
              <a className="iiic-link" href={`/book/confirmed/${booking.reference}/invite.ics`}>
                {CONFIRMED_COPY.addToCalendar}
              </a>
            </p>
          ) : null}
        </div>
        {manageToken ? (
          <p>
            <a className="iiic-btn iiic-btn-secondary" href={`/b/${manageToken}`}>
              {CONFIRMED_COPY.manage}
            </a>
            <br />
            <span className="iiic-type-small">{CONFIRMED_COPY.manageHelp}</span>
          </p>
        ) : null}
      </section>
      {session ? <Scope /> : null}
    </>
  )
}
