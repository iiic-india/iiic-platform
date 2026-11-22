import 'server-only'

import { Forbidden, type Payload, type PayloadRequest } from 'payload'

import { ownerWithCode } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { err, ok, type Result } from '@/lib/result'
import type { Payment, Refund } from '@/payload-types'

import type { PaymentsDeps } from './deps'
import { paymentMove, paymentStatusAfterRefund, refundMove } from './moves'
import type { DecideRefund, PaymentError, RequestRefund } from './operations'
import {
  bookingById,
  idOf,
  paymentById,
  readPaymentSettings,
  refundById,
  refundWhere,
  setBookingPaymentStatus,
  updatePayment,
  updateRefund,
} from './records'
import {
  REFUND_KEY,
  refundableState,
  refundablePaise,
  refundAmountAllowed,
  statusOnRequest,
} from './refundRules'
import { freshRequest, inTransaction, lockRow } from './store'

/**
 * Refunds (docs/05, Money; docs/16 §5): requested with a reason, approved at once when within the
 * threshold in Settings (or when the platform asks, B10), else waiting for an owner; sent to the
 * gateway to the original payment method, with the refund's own key as its receipt; completed by
 * the gateway's answer or its `refund.processed` event, never past the payment's amount.
 *
 * Sending is a step of its own (`sendRefund`), run after the request's transaction has committed:
 * the refund is moved to `processing` and committed before the gateway is called, so a crash or a
 * rollback can never send it twice; a refund sent but not yet recorded is found by its receipt
 * when the gateway's event arrives.
 */

export function makeRequestRefund(deps: PaymentsDeps): RequestRefund {
  return (req, input) =>
    inTransaction(req, async () => {
      if (!REFUND_KEY.test(input.idempotencyKey)) {
        throw new RangeError('A refund key must be 1–40 plain characters')
      }
      if (input.by === 'staff' && !hasRole(req.user, 'owner', 'operator'))
        throw new Forbidden(req.t)
      const existing = await refundWhere(req, { idempotencyKey: { equals: input.idempotencyKey } })
      if (existing) return ok(existing)

      if (!(await lockRow(req, 'payments', input.paymentId))) return err({ code: 'not-found' })
      const payment = await paymentById(req, input.paymentId)
      if (!payment) return err({ code: 'not-found' })
      const state = refundableState(payment)
      if (!state.ok) return state
      if (!refundAmountAllowed(input.amountPaise)) {
        return err({ code: 'refused', gatewayCode: 'BELOW_MINIMUM_AMOUNT' })
      }
      const refundable = await refundablePaise(req, payment)
      if (input.amountPaise > refundable)
        return err({ code: 'over-refund', refundablePaise: refundable })

      const { refundApprovalThresholdPaise } = await readPaymentSettings(req)
      const status = statusOnRequest({
        by: input.by,
        amountPaise: input.amountPaise,
        thresholdPaise: refundApprovalThresholdPaise,
      })
      const requester = input.by === 'staff' ? idOf(req.user as { id: number }) : null
      const refund = await req.payload.create({
        collection: 'refunds',
        data: {
          payment: payment.id,
          booking: idOf(payment.booking),
          status,
          amountPaise: input.amountPaise,
          reason: input.reason,
          reasonNote: input.reasonNote,
          requestedBy: requester,
          // Within the threshold the request is its own approval; the platform's needs none.
          approvedBy: status === 'approved' ? requester : null,
          decidedAt: status === 'approved' ? deps.now().toISOString() : null,
          idempotencyKey: input.idempotencyKey,
        },
        overrideAccess: true,
        depth: 0,
        req,
      })
      if (status === 'awaitingApproval') {
        await deps.emit(req, { name: 'refund.awaitingApproval', refundId: refund.id })
      }
      return ok(refund)
    })
}

/**
 * An owner, with their two-factor code entered, approves or declines a refund waiting for them.
 * The decision's note has no field of its own yet; the refund keeps the request's reason.
 * Approval does not send: the caller runs `sendRefund` once its transaction has committed.
 */
export function makeDecideRefund(deps: PaymentsDeps): DecideRefund {
  return (req, input) =>
    inTransaction(req, async () => {
      if (!ownerWithCode({ req })) return err({ code: 'needs-owner' })
      if (!(await lockRow(req, 'refunds', input.refundId))) return err({ code: 'not-found' })
      const refund = await refundById(req, input.refundId)
      if (!refund) return err({ code: 'not-found' })
      const to = input.decision === 'approve' ? 'approved' : 'declined'
      const move = refundMove(refund.status, to)
      if (!move.ok) return move
      if (to === 'approved') {
        const paymentId = idOf(refund.payment)
        const payment = paymentId === null ? null : await paymentById(req, paymentId)
        if (!payment) return err({ code: 'not-found' })
        const state = refundableState(payment)
        if (!state.ok) return state
        const refundable = await refundablePaise(req, payment, refund.id)
        if (refund.amountPaise > refundable)
          return err({ code: 'over-refund', refundablePaise: refundable })
      }
      const decided = await updateRefund(req, refund.id, {
        status: to,
        approvedBy: idOf(req.user as { id: number }),
        decidedAt: deps.now().toISOString(),
      })
      return ok(decided)
    })
}

/**
 * Completes a refund the gateway has processed: the refund to `processed` (through `processing`
 * when it had not got there), the payment's refunded amount and state, the booking's payment
 * state, and `refund.processed` for the client's message and the credit note (docs/16 §9). In the
 * caller's transaction, with the payment and the refund locked.
 */
export async function completeRefund(
  req: PayloadRequest,
  deps: PaymentsDeps,
  refund: Refund,
  payment: Payment,
  gatewayRefundId: string | null,
): Promise<Result<Refund, PaymentError>> {
  const refundedPaise = (payment.refundedPaise ?? 0) + refund.amountPaise
  if (refundedPaise > payment.amountPaise) {
    return err({
      code: 'over-refund',
      refundablePaise: payment.amountPaise - (payment.refundedPaise ?? 0),
    })
  }
  const paymentStatus = paymentStatusAfterRefund({
    amountPaise: payment.amountPaise,
    refundedPaise,
  })
  const paymentStep = paymentMove(payment.status, paymentStatus)
  if (!paymentStep.ok) return paymentStep
  if (refund.status !== 'processing') {
    const step = refundMove(refund.status, 'processing')
    if (!step.ok) return step
    await updateRefund(req, refund.id, { status: 'processing' })
  }
  const done = await updateRefund(req, refund.id, {
    status: 'processed',
    processedAt: deps.now().toISOString(),
    failureCode: null,
    ...(gatewayRefundId && !refund.gatewayRefundId ? { gatewayRefundId } : {}),
  })
  await updatePayment(req, payment.id, { refundedPaise, status: paymentStatus })
  const bookingId = idOf(payment.booking)
  if (bookingId !== null && (await bookingById(req, bookingId))) {
    await setBookingPaymentStatus(req, bookingId, paymentStatus)
  }
  await deps.emit(req, { name: 'refund.processed', refundId: refund.id })
  return ok(done)
}

/**
 * Sends an approved refund (or a failed one, again, by hand) to the gateway, in transactions of
 * its own: never call it inside a transaction that has yet to commit the approval.
 *  1. The refund moves to `processing`, committed, so nothing can send it a second time.
 *  2. The gateway is asked to refund the original payment, with the refund's key as receipt.
 *  3. The answer is recorded: processed (completed now), pending (the event completes it later),
 *     refused (`failed`, for the office to send again), or no answer (`processing`, with the code
 *     `unavailable`, until the gateway's event or the office settles it).
 */
export function makeSendRefund(deps: PaymentsDeps) {
  return async (
    payload: Payload,
    refundId: number,
    user?: PayloadRequest['user'],
  ): Promise<Result<Refund, PaymentError>> => {
    const gateway = deps.gateway()
    if (!gateway.ok) return gateway

    const claim = await freshRequest(payload, user)
    const sending = await inTransaction(
      claim,
      async (): Promise<Result<{ refund: Refund; paymentId: string } | null, PaymentError>> => {
        if (!(await lockRow(claim, 'refunds', refundId))) return err({ code: 'not-found' })
        const refund = await refundById(claim, refundId)
        if (!refund) return err({ code: 'not-found' })
        if (refund.status !== 'approved' && refund.status !== 'failed') return ok(null)
        const paymentId = idOf(refund.payment)
        const payment = paymentId === null ? null : await paymentById(claim, paymentId)
        if (!payment?.gatewayPaymentId) return err({ code: 'not-found' })
        const moved = await updateRefund(claim, refund.id, {
          status: 'processing',
          failureCode: null,
        })
        return ok({ refund: moved, paymentId: payment.gatewayPaymentId })
      },
    )
    if (!sending.ok) return sending
    if (sending.value === null) {
      const current = await refundById(claim, refundId)
      return current ? ok(current) : err({ code: 'not-found' })
    }
    const { refund, paymentId } = sending.value

    const answer = await gateway.value.refund({
      paymentId,
      amountPaise: refund.amountPaise,
      receipt: refund.idempotencyKey,
    })

    const record = await freshRequest(payload, user)
    return inTransaction(record, async () => {
      // Payment first, then refund: the order every writer of both takes, so none waits on another.
      const paymentDocId = idOf(refund.payment)
      if (paymentDocId === null || !(await lockRow(record, 'payments', paymentDocId))) {
        return err({ code: 'not-found' })
      }
      await lockRow(record, 'refunds', refund.id)
      const current = await refundById(record, refund.id)
      if (!current) return err({ code: 'not-found' })
      // The gateway's event may have completed it in the meantime.
      if (current.status !== 'processing') return ok(current)
      if (!answer.ok) {
        const failureCode =
          answer.error.code === 'refused' ? answer.error.gatewayCode.slice(0, 64) : 'unavailable'
        const status = answer.error.code === 'refused' ? 'failed' : 'processing'
        return ok(await updateRefund(record, current.id, { status, failureCode }))
      }
      const withId = {
        ...(current.gatewayRefundId ? {} : { gatewayRefundId: answer.value.refundId }),
      }
      if (answer.value.status === 'failed') {
        return ok(
          await updateRefund(record, current.id, {
            ...withId,
            status: 'failed',
            failureCode: 'gateway-failed',
          }),
        )
      }
      if (answer.value.status === 'pending') {
        return ok(await updateRefund(record, current.id, withId))
      }
      const payment = await paymentById(record, paymentDocId)
      if (!payment) return err({ code: 'not-found' })
      return completeRefund(record, deps, current, payment, answer.value.refundId)
    })
  }
}

export type SendRefund = ReturnType<typeof makeSendRefund>
