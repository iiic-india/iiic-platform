import type { Metadata } from 'next'

import { Scope } from '@/components/blocks/Scope'
import { CONFIRMED_COPY, MANAGE_COPY } from '@/components/booking/copy'
import { ManageBooking, type RefundPreview } from '@/components/booking/ManageBooking'
import { findByManageToken, viewBooking } from '@/lib/booking/api'
import { loadRules, loadService, paidPaiseFor } from '@/lib/booking/load'
import { refundForCancellation } from '@/lib/booking/policies'
import { refundableOnChain } from '@/lib/bookingFlow/clientRefund'
import { whenOf } from '@/lib/bookingFlow/format'
import { flowRequest } from '@/lib/bookingFlow/server'
import { readPaymentSettings } from '@/lib/payments/records'
import { statusOnRequest } from '@/lib/payments/refundRules'
import { CONTACT, mailHref, telHref } from '@/lib/site/contact'

export const metadata: Metadata = {
  title: MANAGE_COPY.heading,
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

const idOf = (value: number | { id: number } | null | undefined) =>
  value === null || value === undefined ? null : typeof value === 'number' ? value : value.id

/**
 * /b/[token]: manage a booking without an account (docs/03 F4; docs/02). The link's token opens
 * one booking until it ends; what the person may change is the server's answer under the
 * service's rules (D-16), and outside them the page says how to reach IIIC instead. A cancellation
 * shows its refund first, as the rule gives it now (docs/05, Refund); the amount only while prices
 * are published (D-21). The token never leaves this page: no referrer is sent from it.
 */
export default async function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const req = await flowRequest()
  const now = new Date()
  const view = await viewBooking(req, { token }, now)
  if (!view.ok) {
    return (
      <section className="iiic-section">
        <h1 className="iiic-marked">{MANAGE_COPY.heading}</h1>
        <p>{MANAGE_COPY.notFound}</p>
        <p>
          {MANAGE_COPY.contact}:{' '}
          <a className="iiic-link" href={telHref(CONTACT.phone)}>
            {CONTACT.phone}
          </a>{' '}
          ·{' '}
          <a className="iiic-link" href={mailHref(CONTACT.email)}>
            {CONTACT.email}
          </a>
        </p>
      </section>
    )
  }
  const { booking: summary, canReschedule } = view.value
  let canCancel = view.value.canCancel
  const booking = await findByManageToken(req, token, now)
  const service = await loadService(req, summary.serviceId)
  const practitionerId = idOf(booking?.practitioner)
  const practitioner = practitionerId
    ? await req.payload.findByID({
        collection: 'practitioners',
        id: practitionerId,
        depth: 0,
        disableErrors: true,
        overrideAccess: true,
        req,
      })
    : null

  let refund: RefundPreview = { kind: 'nothing-paid' }
  if (booking && canCancel && service) {
    const paid = await paidPaiseFor(req, booking)
    if (paid > 0) {
      const rules = await loadRules(req, service)
      const { refundPaise } = refundForCancellation({
        now,
        startsAt: booking.startsAt ? new Date(booking.startsAt) : now,
        paidPaise: paid,
        steps: rules.ok ? rules.value.refundSteps : [],
        by: 'client',
      })
      // Offered online only when the payments can give it all back: an open refund may hold part
      // of it, and the cancellation then refuses rather than promise more (docs/16 §5).
      if (refundPaise > (await refundableOnChain(req, booking))) canCancel = false
      const settings = await readPaymentSettings(req)
      const awaitsOwner =
        statusOnRequest({
          by: 'staff',
          amountPaise: refundPaise,
          thresholdPaise: settings.refundApprovalThresholdPaise,
        }) === 'awaitingApproval'
      refund =
        refundPaise <= 0
          ? { kind: 'none' }
          : settings.flags.pricesPublic
            ? { kind: 'amount', paise: refundPaise, awaitsOwner }
            : { kind: 'some', awaitsOwner }
    }
  }
  const active = ['requested', 'confirmed', 'held', 'pendingPayment'].includes(summary.status)

  return (
    <>
      <section className="iiic-section">
        <h1 className="iiic-marked">{MANAGE_COPY.heading}</h1>
        <div className="iiic-panel">
          <dl>
            <dt>{CONFIRMED_COPY.reference}</dt>
            <dd>
              <strong>{summary.reference}</strong>
            </dd>
            <dt>{MANAGE_COPY.statusLabel}</dt>
            <dd>{MANAGE_COPY.status[summary.status] ?? summary.status}</dd>
            {service ? (
              <>
                <dt>{CONFIRMED_COPY.what}</dt>
                <dd>
                  {[
                    service.name,
                    booking?.optionLabel,
                    booking?.durationMinutes ? `${booking.durationMinutes} minutes` : null,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </dd>
              </>
            ) : null}
            {summary.startsAt ? (
              <>
                <dt>{CONFIRMED_COPY.when}</dt>
                <dd>{whenOf(summary.startsAt)}</dd>
              </>
            ) : null}
            {summary.format ? (
              <>
                <dt>{CONFIRMED_COPY.where}</dt>
                <dd>
                  {summary.format === 'online' ? CONFIRMED_COPY.online : CONFIRMED_COPY.office}
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
        </div>
        {active ? (
          <>
            <ManageBooking
              token={token}
              canReschedule={canReschedule}
              canCancel={canCancel}
              refund={refund}
            />
            {!canReschedule || !canCancel ? (
              <p>
                {!canReschedule ? MANAGE_COPY.cannotReschedule : MANAGE_COPY.cannotCancel}{' '}
                <a className="iiic-link" href={telHref(CONTACT.phone)}>
                  {CONTACT.phone}
                </a>{' '}
                ·{' '}
                <a className="iiic-link" href={mailHref(CONTACT.email)}>
                  {CONTACT.email}
                </a>
              </p>
            ) : null}
          </>
        ) : null}
      </section>
      {summary.type === 'session' ? <Scope /> : null}
    </>
  )
}
