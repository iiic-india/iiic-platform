import Link from 'next/link'

import { FocusOnArrival } from '@/app/(platform)/newsletter/FocusOnArrival'
import { FLOW_COPY, MANAGE_COPY } from '@/components/booking/copy'
import type { RefundPreview } from '@/lib/accounts/bookings'
import { formatRupees } from '@/lib/bookingFlow/review'

import { BOOKING_COPY } from './copy'
import { Problem } from './Problem'

const HEADING_ID = 'cancel-heading'
const PROBLEM_ID = 'cancel-problem'

/** The refund a cancellation gives now, said before it is confirmed (docs/05, Refund). */
export function refundLine(refund: RefundPreview): string {
  switch (refund.kind) {
    case 'nothing-paid':
      return MANAGE_COPY.nothingPaid
    case 'none':
      return MANAGE_COPY.noRefund
    case 'amount':
      return MANAGE_COPY.refundAmount(formatRupees(refund.paise))
    case 'some':
      return MANAGE_COPY.refundSome
  }
}

/**
 * Cancelling a booking within policy (docs/20 §7.2; docs/03 F4; D-16), as the manage link does:
 * the refund the service's rule gives now, the amount only while prices are published (D-21,
 * D-101), an optional reason, and "Keep my booking" beside "Cancel my booking" at the same size
 * (docs/08 §5). A form the server draws, so it works without JavaScript.
 */
export function CancelForm({
  reference,
  refund,
  problem,
  action,
}: {
  reference: string
  refund: RefundPreview
  problem: string | null
  action: (form: FormData) => Promise<void>
}) {
  const back = `/account/bookings/${encodeURIComponent(reference)}`
  return (
    <section className="iiic-panel" aria-labelledby={HEADING_ID}>
      <h2 id={HEADING_ID} tabIndex={-1}>
        {MANAGE_COPY.cancelHeading}
      </h2>
      {problem ? (
        <Problem id={PROBLEM_ID} heading={BOOKING_COPY.errorSummary} message={problem} />
      ) : (
        <FocusOnArrival id={HEADING_ID} />
      )}
      <p>{refundLine(refund)}</p>
      {(refund.kind === 'amount' || refund.kind === 'some') && refund.awaitsOwner ? (
        <p className="iiic-type-small">{MANAGE_COPY.refundOwner}</p>
      ) : null}
      <form action={action}>
        <input type="hidden" name="reference" value={reference} />
        <div className="iiic-field-wrap">
          <label className="iiic-label" htmlFor="cancel-reason">
            {MANAGE_COPY.reasonLabel} {FLOW_COPY.optional}
          </label>
          <textarea
            className="iiic-field"
            id="cancel-reason"
            name="reason"
            rows={3}
            maxLength={1000}
            aria-describedby="cancel-reason-help"
          />
          <div className="iiic-help" id="cancel-reason-help">
            {MANAGE_COPY.reasonHelp}
          </div>
        </div>
        <div className="iiic-row">
          <Link className="iiic-btn iiic-btn-secondary" href={back} prefetch={false}>
            {MANAGE_COPY.keep}
          </Link>
          <button className="iiic-btn iiic-btn-primary" type="submit">
            {MANAGE_COPY.cancelConfirm}
          </button>
        </div>
      </form>
    </section>
  )
}
