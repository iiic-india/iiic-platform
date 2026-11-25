import Link from 'next/link'

import { FocusOnArrival } from '@/app/(platform)/newsletter/FocusOnArrival'
import { FLOW_COPY, MANAGE_COPY } from '@/components/booking/copy'
import { dayLong, timeOf } from '@/lib/bookingFlow/format'

import { BOOKING_COPY } from './copy'
import { Problem } from './Problem'

const HEADING_ID = 'reschedule-heading'
const PROBLEM_ID = 'reschedule-problem'
const FIRST_TIME_ID = 'new-time'

/**
 * Moving a booking to another free time (docs/20 §7.2; docs/03 F4): the times M3's slot engine
 * offers, by day in India, as one group of radio buttons in a form the server draws, so it works
 * without JavaScript (docs/12 §4); the server action moves the booking under the service's rules
 * and answers with the new booking's page, or this form again with what went wrong. "Back" has
 * the same size as the move.
 */
export function RescheduleForm({
  reference,
  days,
  problem,
  action,
}: {
  reference: string
  days: { day: string; starts: string[] }[]
  problem: string | null
  action: (form: FormData) => Promise<void>
}) {
  const back = `/account/bookings/${encodeURIComponent(reference)}`
  return (
    <section className="iiic-panel" aria-labelledby={HEADING_ID}>
      <h2 id={HEADING_ID} tabIndex={-1}>
        {MANAGE_COPY.rescheduleHeading}
      </h2>
      {problem ? (
        <Problem
          id={PROBLEM_ID}
          heading={BOOKING_COPY.errorSummary}
          message={problem}
          field={days.length ? FIRST_TIME_ID : undefined}
        />
      ) : (
        <FocusOnArrival id={HEADING_ID} />
      )}
      {days.length ? (
        <form action={action}>
          <input type="hidden" name="reference" value={reference} />
          {days.map((entry) => (
            <fieldset className="iiic-fieldset" key={entry.day}>
              <legend>{dayLong(entry.day)}</legend>
              <div className="iiic-slots">
                {entry.starts.map((start, index) => (
                  <label className="iiic-slot" key={start}>
                    <input
                      type="radio"
                      name="startsAt"
                      value={start}
                      id={entry === days[0] && index === 0 ? FIRST_TIME_ID : undefined}
                      required
                    />
                    <span>{timeOf(start)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <p className="iiic-type-small">{FLOW_COPY.timesInIndia}</p>
          <div className="iiic-row">
            <Link className="iiic-btn iiic-btn-secondary" href={back} prefetch={false}>
              {FLOW_COPY.back}
            </Link>
            <button className="iiic-btn iiic-btn-primary" type="submit">
              {MANAGE_COPY.rescheduleConfirm}
            </button>
          </div>
        </form>
      ) : (
        <>
          <p>{BOOKING_COPY.noTimes}</p>
          <p>
            <Link className="iiic-btn iiic-btn-secondary" href={back} prefetch={false}>
              {FLOW_COPY.back}
            </Link>
          </p>
        </>
      )}
    </section>
  )
}
