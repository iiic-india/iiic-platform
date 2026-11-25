import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { FocusOnArrival } from '@/app/(platform)/newsletter/FocusOnArrival'
import styles from '@/components/account/account.module.css'
import { BookingDetails } from '@/components/account/BookingDetails'
import { CancelForm } from '@/components/account/CancelForm'
import { BOOKING_COPY, bookingError, titleOf } from '@/components/account/copy'
import { RescheduleForm } from '@/components/account/RescheduleForm'
import { Scope } from '@/components/blocks/Scope'
import { MANAGE_COPY } from '@/components/booking/copy'
import { isCounselling, ownBookingPage, ownFreeTimes } from '@/lib/accounts/bookings'
import { accountRequest, openMyIiic } from '@/lib/accounts/scope'
import { whenOf } from '@/lib/bookingFlow/format'
import { CONTACT, mailHref, telHref } from '@/lib/site/contact'

import { cancelOwnAction, rescheduleOwnAction } from '../../actions'

export const metadata: Metadata = {
  title: titleOf(MANAGE_COPY.heading),
  robots: { index: false, follow: false },
}

type Props = {
  params: Promise<{ ref: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const OUTCOME_ID = 'booking-outcome'
const ACTIVE: readonly string[] = ['requested', 'held', 'pendingPayment', 'confirmed']

function Contact() {
  return (
    <>
      <a className="iiic-link" href={telHref(CONTACT.phone)}>
        {CONTACT.phone}
      </a>{' '}
      ·{' '}
      <a className="iiic-link" href={mailHref(CONTACT.email)}>
        {CONTACT.email}
      </a>
    </>
  )
}

/**
 * /account/bookings/[ref] (docs/20 §7.2): one of the account's bookings as its confirmation shows
 * it, "Add to your calendar", and moving or cancelling it within the service's rules, as the
 * manage link allows (docs/03 F4; D-16); outside them, how to reach IIIC. The two changes are
 * forms the server draws (`?step=reschedule`, `?step=cancel`) and posts, so they work without
 * JavaScript; each comes back here with its outcome. "Not your booking?" asks IIIC to correct the
 * records and hides nothing on its own (D-120). A counselling booking's page ends with the scope
 * statement and the crisis numbers (docs/08 §7), and carries no offer. Any booking that is not
 * the account's is the 404, as one that does not exist (D-127).
 */
export default async function BookingPage({ params, searchParams }: Props) {
  const account = await openMyIiic('/account/bookings')
  const { ref } = await params
  const query = await searchParams
  const one = (name: string) => {
    const value = query[name]
    return typeof value === 'string' ? value : null
  }
  const req = await accountRequest()
  const now = new Date()
  const page = await ownBookingPage(req, account, ref, now)
  if (!page) notFound()
  const { booking } = page
  const step = one('step')
  const problem = one('problem')

  let form = null
  if (step === 'reschedule' && booking.canReschedule) {
    const times = await ownFreeTimes(req, account, booking.reference, now)
    form = (
      <RescheduleForm
        reference={booking.reference}
        days={times.ok ? times.value.days : []}
        problem={problem ? bookingError(problem) : null}
        action={rescheduleOwnAction}
      />
    )
  } else if (step === 'cancel' && booking.canCancel) {
    form = (
      <CancelForm
        reference={booking.reference}
        refund={page.refund}
        problem={problem ? bookingError(problem) : null}
        action={cancelOwnAction}
      />
    )
  }

  // What the last change did, said once on arrival; only what the booking itself bears out.
  const done = one('done')
  const refund = one('refund')
  const outcome =
    done === 'moved' && booking.status === 'confirmed' && booking.startsAt
      ? MANAGE_COPY.rescheduled(whenOf(booking.startsAt.toISOString()))
      : done === 'cancelled' && booking.status === 'cancelledByClient'
        ? [
            MANAGE_COPY.cancelled,
            refund === 'sent' || refund === 'owner' ? MANAGE_COPY.refundSome : null,
            refund === 'sent' ? MANAGE_COPY.refundSent : null,
            refund === 'owner' ? MANAGE_COPY.refundOwner : null,
          ]
            .filter(Boolean)
            .join(' ')
        : null
  const active = ACTIVE.includes(booking.status)
  const here = `/account/bookings/${encodeURIComponent(booking.reference)}`

  return (
    <div className={`iiic-page ${styles.page} ${styles.stack}`}>
      <h1 className="iiic-marked">{MANAGE_COPY.heading}</h1>
      {outcome ? (
        <>
          <div className="iiic-alert iiic-alert-green" role="status" tabIndex={-1} id={OUTCOME_ID}>
            {outcome}
          </div>
          <FocusOnArrival id={OUTCOME_ID} />
        </>
      ) : null}
      {problem && !form ? (
        <div className="iiic-alert iiic-alert-yellow" role="alert">
          {bookingError(problem)}
        </div>
      ) : null}
      {page.movedTo ? (
        <p>
          {BOOKING_COPY.movedTo}{' '}
          <Link
            className="iiic-link"
            href={`/account/bookings/${encodeURIComponent(page.movedTo)}`}
            prefetch={false}
          >
            {BOOKING_COPY.seeNew}
          </Link>
        </p>
      ) : null}

      <div className="iiic-panel">
        <BookingDetails
          booking={booking}
          option={{ label: page.optionLabel, minutes: page.durationMinutes }}
        />
      </div>

      {form ??
        (active ? (
          <div>
            {booking.canReschedule || booking.canCancel ? (
              <div className="iiic-row">
                {booking.canReschedule ? (
                  <Link
                    className="iiic-btn iiic-btn-primary"
                    href={`${here}?step=reschedule`}
                    prefetch={false}
                  >
                    {MANAGE_COPY.reschedule}
                  </Link>
                ) : null}
                {booking.canCancel ? (
                  <Link
                    className="iiic-btn iiic-btn-secondary"
                    href={`${here}?step=cancel`}
                    prefetch={false}
                  >
                    {MANAGE_COPY.cancel}
                  </Link>
                ) : null}
              </div>
            ) : null}
            {!booking.canReschedule || !booking.canCancel ? (
              <p>
                {!booking.canReschedule ? MANAGE_COPY.cannotReschedule : MANAGE_COPY.cannotCancel}{' '}
                <Contact />
              </p>
            ) : null}
          </div>
        ) : null)}

      <section aria-labelledby="not-yours">
        <h2 id="not-yours">{BOOKING_COPY.notYoursHeading}</h2>
        <p>{BOOKING_COPY.notYours}</p>
        <p>
          <Link
            className="iiic-link"
            href={`/account/privacy?request=correction&booking=${encodeURIComponent(booking.reference)}`}
            prefetch={false}
          >
            {BOOKING_COPY.notYoursLink}
          </Link>
        </p>
      </section>

      <p>
        <Link className="iiic-link" href="/account/bookings" prefetch={false}>
          {BOOKING_COPY.allBookings}
        </Link>
      </p>

      {isCounselling(booking) ? <Scope /> : null}
    </div>
  )
}
