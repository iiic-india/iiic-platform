import { Gutter } from '@payloadcms/ui'
import Link from 'next/link'
import type { DocumentViewServerProps } from 'payload'

import { BOOKING_PAYMENT_STATUSES, BOOKING_STATUSES } from '@/lib/booking/states'
import type { CancelPreview } from '@/lib/office/actions'
import { formatPaise, formatWhen } from '@/lib/office/copy'
import { isOfficeUser } from '@/lib/office/who'
import { officeActions } from '@/lib/office/wiring'
import { REFUND_STATUSES } from '@/lib/payments/states'
import type { Booking, Practitioner, Refund } from '@/payload-types'

import styles from './Office.module.css'
import { OfficeActionForm } from './OfficeActionForm'
import { OFFICE_VIEW_COPY as COPY } from './officeViewCopy'
import { DATETIME_STEP_SECONDS, formatDay, labelOf, requireStaffWithCode } from './shared'

const idOf = (value: number | { id: number } | null | undefined): number | null =>
  typeof value === 'number' ? value : (value?.id ?? null)

function Facts({ booking }: { booking: Booking }) {
  const total = booking.price?.totalPaise ?? 0
  return (
    <dl className={styles.facts}>
      <dt>{COPY.reference}</dt>
      <dd>{booking.reference}</dd>
      <dt>{COPY.status}</dt>
      <dd>{labelOf(BOOKING_STATUSES, booking.status)}</dd>
      <dt>{COPY.payment}</dt>
      <dd>{labelOf(BOOKING_PAYMENT_STATUSES, booking.paymentStatus)}</dd>
      <dt>{COPY.when}</dt>
      <dd>{booking.startsAt ? formatWhen(booking.startsAt) : COPY.noTime}</dd>
      <dt>{COPY.total}</dt>
      <dd>{total > 0 ? formatPaise(total) : COPY.noPrice}</dd>
    </dl>
  )
}

function TimeField({
  name,
  label,
  hint,
  required,
}: {
  name: string
  label: string
  hint: string
  required: boolean
}) {
  const id = `office-${name}`
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        aria-describedby={`${id}-hint`}
        className={styles.input}
        id={id}
        name={name}
        required={required}
        step={DATETIME_STEP_SECONDS}
        type="datetime-local"
      />
      <p className={styles.hint} id={`${id}-hint`}>
        {hint}
      </p>
    </div>
  )
}

function ConfirmTime({
  booking,
  practitioners,
}: {
  booking: Booking
  practitioners: Practitioner[]
}) {
  const request = booking.timeRequest
  const current = idOf(booking.practitioner as number | { id: number } | null)
  return (
    <section aria-labelledby="office-confirm" className={styles.panel}>
      <h2 id="office-confirm">{COPY.confirmTitle}</h2>
      <dl className={styles.facts}>
        <dt>{COPY.preferredDays}</dt>
        <dd>
          {request?.preferredDays?.length
            ? request.preferredDays.map((entry) => formatDay(entry.day)).join(', ')
            : COPY.none}
        </dd>
        <dt>{COPY.preferredTimes}</dt>
        <dd>{request?.preferredTimes || COPY.none}</dd>
        <dt>{COPY.note}</dt>
        <dd>{request?.note || COPY.none}</dd>
      </dl>
      <OfficeActionForm
        labelledBy="office-confirm"
        path={`/bookings/${booking.id}/confirm-time`}
        submitLabel={COPY.confirmSubmit}
      >
        <TimeField hint={COPY.agreedHint} label={COPY.agreedTime} name="startsAt" required />
        <div className={styles.field}>
          <label className={styles.label} htmlFor="office-practitionerId">
            {COPY.practitioner}
          </label>
          <select
            className={styles.input}
            defaultValue={current ?? ''}
            id="office-practitionerId"
            name="practitionerId"
            required={current === null}
          >
            <option value="">{COPY.choosePractitioner}</option>
            {practitioners.map((practitioner) => (
              <option key={practitioner.id} value={practitioner.id}>
                {practitioner.publicName}
              </option>
            ))}
          </select>
        </div>
      </OfficeActionForm>
    </section>
  )
}

function Reschedule({ booking }: { booking: Booking }) {
  return (
    <section aria-labelledby="office-reschedule" className={styles.panel}>
      <h2 id="office-reschedule">{COPY.rescheduleTitle}</h2>
      <OfficeActionForm
        labelledBy="office-reschedule"
        path={`/bookings/${booking.id}/reschedule`}
        submitLabel={COPY.rescheduleSubmit}
      >
        <TimeField hint={COPY.newTimeHint} label={COPY.newTime} name="startsAt" required />
      </OfficeActionForm>
    </section>
  )
}

function PaymentLink({ booking }: { booking: Booking }) {
  const again = booking.paymentStatus === 'linkSent'
  return (
    <section aria-labelledby="office-link" className={styles.panel}>
      <h2 id="office-link">{COPY.linkTitle}</h2>
      <p className={styles.intro}>
        {COPY.linkAmount(formatPaise(booking.price?.totalPaise ?? 0))}
        {again ? ` ${COPY.linkAgain}` : ''}
      </p>
      <OfficeActionForm
        labelledBy="office-link"
        path={`/bookings/${booking.id}/payment-link`}
        submitLabel={again ? COPY.linkSubmitAgain : COPY.linkSubmit}
      >
        <TimeField
          hint={COPY.linkEndsHint}
          label={COPY.linkEnds}
          name="expiresAt"
          required={false}
        />
      </OfficeActionForm>
    </section>
  )
}

function Cancel({ booking, preview }: { booking: Booking; preview: CancelPreview }) {
  const choice = (by: 'client' | 'iiic') => {
    const entry = preview[by]
    if (!entry.allowed) return COPY.notFromHere
    if (entry.refundPaise === 0) return COPY.noRefund
    return `${COPY.refundOf(formatPaise(entry.refundPaise))}${by === 'iiic' ? `: ${COPY.inFull}` : ''}`
  }
  return (
    <section aria-labelledby="office-cancel" className={styles.panel}>
      <h2 id="office-cancel">{COPY.cancelTitle}</h2>
      <p className={styles.intro}>{COPY.refundFirst}</p>
      <table className={styles.table}>
        <tbody>
          <tr>
            <th scope="row">{COPY.byClient}</th>
            <td>{choice('client')}</td>
          </tr>
          <tr>
            <th scope="row">{COPY.byIiic}</th>
            <td>{choice('iiic')}</td>
          </tr>
        </tbody>
      </table>
      {preview.paidPaise > 0 && !preview.refundRuleSet ? (
        <p className={styles.hint}>{COPY.noRule}</p>
      ) : null}
      {preview.paidPaise > 0 ? <p className={styles.hint}>{COPY.threshold}</p> : null}
      <OfficeActionForm
        labelledBy="office-cancel"
        path={`/bookings/${booking.id}/cancel`}
        submitLabel={COPY.cancelSubmit}
      >
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>{COPY.who}</legend>
          {(['client', 'iiic'] as const).map((by) => (
            <label className={styles.choice} key={by}>
              <input disabled={!preview[by].allowed} name="by" required type="radio" value={by} />
              <span>
                {by === 'client' ? COPY.byClient : COPY.byIiic} ({choice(by)})
              </span>
            </label>
          ))}
        </fieldset>
        <input name="shownClientPaise" type="hidden" value={preview.client.refundPaise} />
        <input name="shownIiicPaise" type="hidden" value={preview.iiic.refundPaise} />
        <div className={styles.field}>
          <label className={styles.label} htmlFor="office-reason">
            {COPY.reason}
          </label>
          <textarea
            aria-describedby="office-reason-hint"
            className={styles.input}
            id="office-reason"
            maxLength={1000}
            name="reason"
            required
            rows={3}
          />
          <p className={styles.hint} id="office-reason-hint">
            {COPY.reasonHint}
          </p>
        </div>
      </OfficeActionForm>
    </section>
  )
}

function Refunds({ refunds, admin }: { refunds: Refund[]; admin: string }) {
  return (
    <section aria-labelledby="office-refunds" className={styles.panel}>
      <h2 id="office-refunds">{COPY.refundsTitle}</h2>
      {refunds.length === 0 ? (
        <p>{COPY.refundsNone}</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{COPY.amount}</th>
              <th scope="col">{COPY.status}</th>
              <th scope="col">{COPY.record}</th>
            </tr>
          </thead>
          <tbody>
            {refunds.map((refund) => (
              <tr key={refund.id}>
                <td>{formatPaise(refund.amountPaise)}</td>
                <td>{labelOf(REFUND_STATUSES, refund.status)}</td>
                <td>
                  <Link href={`${admin}/collections/refunds/${refund.id}/decision`}>
                    {COPY.open}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

const PAYABLE: readonly string[] = ['unpaid', 'linkSent']

/**
 * A booking's "Office actions" tab (docs/05, Bookings; docs/16 §12, E): confirm a time request,
 * move the booking, send a payment link, and cancel it with the refund the policy gives shown
 * before anyone confirms. The user, the two-factor code and the role are checked first; each
 * form's endpoint checks them again (src/lib/office/handlers.ts).
 */
export async function BookingOfficeView({ initPageResult, doc }: DocumentViewServerProps) {
  const { req } = initPageResult
  requireStaffWithCode(req)
  const admin = req.payload.config.routes.admin
  if (!isOfficeUser(req.user)) {
    return (
      <Gutter className={styles.view}>
        <p>{COPY.officeOnly}</p>
      </Gutter>
    )
  }
  const id = Number((doc as { id?: unknown } | undefined)?.id)
  const booking = Number.isInteger(id)
    ? await req.payload.findByID({
        collection: 'bookings',
        id,
        depth: 0,
        disableErrors: true,
        overrideAccess: false,
        req,
      })
    : null
  if (!booking) {
    return (
      <Gutter className={styles.view}>
        <p>{COPY.notFound}</p>
      </Gutter>
    )
  }

  const preview = await officeActions().cancelPreview(req, booking.id)
  const { docs: refunds } = await req.payload.find({
    collection: 'refunds',
    where: { booking: { equals: booking.id } },
    depth: 0,
    pagination: false,
    overrideAccess: false,
    req,
  })
  const serviceId = idOf(booking.service as number | { id: number })
  const practitioners =
    booking.status === 'requested' && serviceId !== null
      ? (
          await req.payload.find({
            collection: 'practitioners',
            where: { and: [{ active: { equals: true } }, { services: { in: [serviceId] } }] },
            depth: 0,
            pagination: false,
            overrideAccess: false,
            req,
          })
        ).docs
      : []
  const total = booking.price?.totalPaise ?? 0
  const cancellable = preview.ok && (preview.value.client.allowed || preview.value.iiic.allowed)

  return (
    <Gutter className={styles.view}>
      <h2>{COPY.bookingTitle}</h2>
      <p className={styles.intro}>{COPY.bookingIntro}</p>
      <Facts booking={booking} />
      {booking.status === 'requested' ? (
        <ConfirmTime booking={booking} practitioners={practitioners} />
      ) : null}
      {booking.status === 'confirmed' ? <Reschedule booking={booking} /> : null}
      {booking.status === 'confirmed' && total > 0 && PAYABLE.includes(booking.paymentStatus) ? (
        <PaymentLink booking={booking} />
      ) : null}
      {cancellable && preview.ok ? <Cancel booking={booking} preview={preview.value} /> : null}
      <Refunds admin={admin} refunds={refunds} />
    </Gutter>
  )
}
