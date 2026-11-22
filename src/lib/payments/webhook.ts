import 'server-only'

import type { PayloadRequest } from 'payload'

import type { BookingError } from '@/lib/booking/operations'
import { err, ok, type Result } from '@/lib/result'
import type { Booking, Payment, Refund } from '@/payload-types'

import type { PaymentsDeps } from './deps'
import { planPaymentEvent, planRefundEvent, type EventNote } from './eventPlan'
import type { PaymentError, VerifiedGatewayEvent } from './operations'
import {
  bookingById,
  idOf,
  paymentFacts,
  paymentWhere,
  refundFacts,
  refundWhere,
  setBookingPaymentStatus,
  updatePayment,
  updateRefund,
} from './records'
import { completeRefund, makeRequestRefund } from './refunds'
import {
  claimGatewayEvent,
  inLiveTransaction,
  inTransaction,
  lockRow,
  slotTakenByAnother,
} from './store'
import type { ParsedGatewayEvent } from './webhookEvent'

/**
 * Processes one verified gateway event once (docs/16 §5; CLAUDE.md #5). In one transaction: the
 * event is claimed under its unique (gateway, eventId) index, then acted on, then its outcome is
 * written. An event already there is a replay and changes nothing. If acting throws, the whole
 * transaction rolls back, the claim with it, and the caller answers 500 so Razorpay sends it
 * again. Acting is idempotent in its own right: a capture on a payment already captured is
 * ignored, and an amount or a currency that differs from the payment's is flagged and confirms
 * nothing.
 *
 * A capture confirms the booking through the booking module's ConfirmBooking. When the hold had
 * lapsed and someone else holds the time now, the platform asks for a full refund in its own
 * name instead (B10), the event is flagged `slot-taken` and `booking.slotLost` is emitted. The
 * time is asked about first, in this transaction: a write the exclusion constraint refuses makes
 * Payload roll the whole transaction back, so the constraint is left to settle only a true race,
 * whose loser is retried and finds the time taken. The refund is sent to the gateway after this
 * transaction commits (`refundsToSend`), never inside it.
 *
 * Logs hold the event's type and outcome, never its body.
 */

export type EventSource = 'webhook' | 'poll' | 'reconciliation'

export type ProcessedEvent = {
  outcome: 'processed' | 'ignored' | 'flagged' | 'replay'
  /** Refunds approved while processing, for the caller to send once its transaction commits. */
  refundsToSend: number[]
}

type Acted = {
  outcome: 'processed' | 'ignored' | 'flagged'
  note: EventNote | 'slot-taken' | `booking-${string}` | null
  paymentId: number | null
  refundId: number | null
  refundsToSend: number[]
}

/** The event with the two fields the contract leaves out, read as absent when a caller has none. */
function complete(event: VerifiedGatewayEvent & Partial<ParsedGatewayEvent>): ParsedGatewayEvent {
  return { ...event, currency: event.currency ?? null, refundReceipt: event.refundReceipt ?? null }
}

/** Finds the payment an event is about: by link, by order, then by the gateway's payment id. */
async function paymentFor(req: PayloadRequest, event: ParsedGatewayEvent): Promise<Payment | null> {
  if (event.type.startsWith('payment_link.')) {
    return event.gatewayPaymentLinkId
      ? paymentWhere(req, { gatewayPaymentLinkId: { equals: event.gatewayPaymentLinkId } })
      : null
  }
  if (event.gatewayOrderId) {
    const byOrder = await paymentWhere(req, { gatewayOrderId: { equals: event.gatewayOrderId } })
    if (byOrder) return byOrder
  }
  return event.gatewayPaymentId
    ? paymentWhere(req, { gatewayPaymentId: { equals: event.gatewayPaymentId } })
    : null
}

/** Reads a payment again under its row lock, so a second writer waits for the first's commit. */
async function locked(req: PayloadRequest, payment: Payment | null): Promise<Payment | null> {
  if (!payment || !(await lockRow(req, 'payments', payment.id))) return null
  return paymentWhere(req, { id: { equals: payment.id } })
}

const OPEN_FOR_PAYMENT: readonly Booking['status'][] = ['held', 'pendingPayment', 'expired']

export function makeProcessGatewayEvent(deps: PaymentsDeps) {
  const requestRefund = makeRequestRefund(deps)

  /** Confirms the booking a capture paid for, or refunds the payment when its slot was taken. */
  async function confirmPaidBooking(
    req: PayloadRequest,
    payment: Payment,
    booking: Booking,
  ): Promise<Pick<Acted, 'outcome' | 'note' | 'refundsToSend'>> {
    if (booking.status === 'confirmed')
      return { outcome: 'processed', note: null, refundsToSend: [] }
    if (!OPEN_FOR_PAYMENT.includes(booking.status)) {
      // Paid for a booking that was cancelled, completed or moved: the office decides.
      return { outcome: 'flagged', note: `booking-${booking.status}`, refundsToSend: [] }
    }
    // A lapsed hold's time may have gone to someone else: asked first, in this transaction, so
    // the database is not made to refuse a write (which would end the whole transaction).
    const confirmed: Result<Booking, BookingError> =
      booking.status === 'expired' && (await slotTakenByAnother(req, booking))
        ? err({ code: 'slot-taken' })
        : await deps.confirmBooking(req, { bookingId: booking.id, cause: 'paymentCaptured' })
    if (!(await inLiveTransaction(req))) {
      // Someone took the time between the question and the write, and the constraint refused it;
      // Payload has rolled the transaction back. Thrown, so the event is retried, and the retry
      // finds the time taken above.
      throw new Error(
        'The booking’s confirmation ended the transaction; the event will be retried.',
      )
    }
    if (confirmed.ok) return { outcome: 'processed', note: null, refundsToSend: [] }
    if (confirmed.error.code !== 'slot-taken') {
      return { outcome: 'flagged', note: `booking-${confirmed.error.code}`, refundsToSend: [] }
    }
    // B10: the time went to someone else while this payment was on its way.
    const refund = await requestRefund(req, {
      paymentId: payment.id,
      amountPaise: payment.amountPaise,
      reason: 'slotTaken',
      idempotencyKey: `slotTaken:${payment.id}`,
      by: 'platform',
    })
    if (!refund.ok)
      throw new Error(`The slot-taken refund could not be requested (${refund.error.code}).`)
    await deps.emit(req, { name: 'booking.slotLost', bookingId: booking.id, paymentId: payment.id })
    return {
      outcome: 'flagged',
      note: 'slot-taken',
      refundsToSend: refund.value.status === 'approved' ? [refund.value.id] : [],
    }
  }

  async function capture(
    req: PayloadRequest,
    payment: Payment,
    event: ParsedGatewayEvent,
  ): Promise<Acted> {
    const base = { paymentId: payment.id, refundId: null }
    const captured = await updatePayment(req, payment.id, {
      status: 'captured',
      gatewayPaymentId: event.gatewayPaymentId,
      method: event.method,
      failureCode: null,
      capturedAt: deps.now().toISOString(),
    })
    const bookingId = idOf(payment.booking)
    if (bookingId === null || !(await lockRow(req, 'bookings', bookingId))) {
      return { ...base, outcome: 'flagged', note: 'booking-not-found', refundsToSend: [] }
    }
    await setBookingPaymentStatus(req, bookingId, 'paid')
    await deps.emit(req, { name: 'payment.captured', paymentId: payment.id, bookingId })
    const booking = await bookingById(req, bookingId)
    if (!booking)
      return { ...base, outcome: 'flagged', note: 'booking-not-found', refundsToSend: [] }
    return { ...base, ...(await confirmPaidBooking(req, captured, booking)) }
  }

  async function actOnPayment(req: PayloadRequest, event: ParsedGatewayEvent): Promise<Acted> {
    const payment = await locked(req, await paymentFor(req, event))
    const plan = planPaymentEvent(event, payment && paymentFacts(payment))
    const base = { paymentId: payment?.id ?? null, refundId: null, refundsToSend: [] }
    if (plan.outcome !== 'processed' || !payment) {
      return {
        ...base,
        outcome: plan.outcome === 'processed' ? 'ignored' : plan.outcome,
        note: plan.outcome === 'processed' ? null : plan.note,
      }
    }
    const bookingId = idOf(payment.booking)
    switch (plan.to) {
      case 'captured':
        return capture(req, payment, event)
      case 'authorized':
        await updatePayment(req, payment.id, {
          status: 'authorized',
          gatewayPaymentId: event.gatewayPaymentId,
          method: event.method,
        })
        return { ...base, outcome: 'processed', note: null }
      case 'failed':
        // The hold stays for a second attempt (docs/03 F3); only the code is kept.
        await updatePayment(req, payment.id, {
          status: 'failed',
          failureCode: event.errorCode?.slice(0, 64) ?? 'unknown',
        })
        if (bookingId !== null) {
          await deps.emit(req, { name: 'payment.failed', paymentId: payment.id, bookingId })
        }
        return { ...base, outcome: 'processed', note: null }
      case 'expired':
      case 'cancelled': {
        await updatePayment(req, payment.id, { status: plan.to })
        const booking = bookingId === null ? null : await bookingById(req, bookingId)
        if (booking?.paymentStatus === 'linkSent') {
          await setBookingPaymentStatus(req, booking.id, 'unpaid')
        }
        return { ...base, outcome: 'processed', note: null }
      }
      default:
        return { ...base, outcome: 'ignored', note: 'out-of-order' }
    }
  }

  async function actOnRefund(req: PayloadRequest, event: ParsedGatewayEvent): Promise<Acted> {
    const found =
      (event.gatewayRefundId
        ? await refundWhere(req, { gatewayRefundId: { equals: event.gatewayRefundId } })
        : null) ??
      (event.refundReceipt
        ? await refundWhere(req, { idempotencyKey: { equals: event.refundReceipt } })
        : null)
    const paymentId = found ? idOf(found.payment) : null
    const payment = await locked(
      req,
      paymentId !== null
        ? await paymentWhere(req, { id: { equals: paymentId } })
        : event.gatewayPaymentId
          ? await paymentWhere(req, { gatewayPaymentId: { equals: event.gatewayPaymentId } })
          : null,
    )
    let refund: Refund | null = null
    if (found && (await lockRow(req, 'refunds', found.id))) {
      refund = await refundWhere(req, { id: { equals: found.id } })
    }
    const plan = planRefundEvent(
      event,
      refund && refundFacts(refund),
      payment && paymentFacts(payment),
    )
    const base = { paymentId: payment?.id ?? null, refundId: refund?.id ?? null, refundsToSend: [] }
    if (plan.outcome !== 'processed' || !refund) {
      return {
        ...base,
        outcome: plan.outcome === 'processed' ? 'ignored' : plan.outcome,
        note: plan.outcome === 'processed' ? null : plan.note,
      }
    }
    if (plan.steps.at(-1) === 'processed') {
      if (!payment) return { ...base, outcome: 'flagged', note: 'unknown-order' }
      const done = await completeRefund(req, deps, refund, payment, event.gatewayRefundId)
      if (!done.ok)
        return {
          ...base,
          outcome: 'flagged',
          note: done.error.code === 'over-refund' ? 'over-refund' : 'out-of-order',
        }
      return { ...base, outcome: 'processed', note: null }
    }
    for (const status of plan.steps) {
      await updateRefund(req, refund.id, {
        status,
        ...(status === 'failed' ? { failureCode: 'gateway-failed' } : {}),
        ...(event.gatewayRefundId && !refund.gatewayRefundId
          ? { gatewayRefundId: event.gatewayRefundId }
          : {}),
      })
    }
    return { ...base, outcome: 'processed', note: null }
  }

  return async function processGatewayEvent(
    req: PayloadRequest,
    event: VerifiedGatewayEvent & Partial<ParsedGatewayEvent>,
    source: EventSource,
  ): Promise<Result<ProcessedEvent, PaymentError>> {
    const parsed = complete(event)
    return inTransaction(req, async () => {
      const eventRowId = await claimGatewayEvent(req, parsed, source, deps.now())
      if (eventRowId === null) return ok({ outcome: 'replay', refundsToSend: [] })
      const acted = parsed.type.startsWith('refund.')
        ? await actOnRefund(req, parsed)
        : await actOnPayment(req, parsed)
      await req.payload.update({
        collection: 'gateway-events',
        id: eventRowId,
        data: {
          outcome: acted.outcome,
          note: acted.note?.slice(0, 100) ?? null,
          payment: acted.paymentId,
          refund: acted.refundId,
        },
        overrideAccess: true,
        depth: 0,
        req,
      })
      req.payload.logger.info(
        `Gateway event ${parsed.type} (${source}): ${acted.outcome}${acted.note ? ` (${acted.note})` : ''}.`,
      )
      return ok({ outcome: acted.outcome, refundsToSend: acted.refundsToSend })
    })
  }
}

export type ProcessGatewayEventWith = ReturnType<typeof makeProcessGatewayEvent>
