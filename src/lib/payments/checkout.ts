import 'server-only'

import type { Payload } from 'payload'

import { err, ok, type Result } from '@/lib/result'
import type { Payment } from '@/payload-types'

import type { PaymentsDeps } from './deps'
import type { GatewayPayment } from './gateway'
import { CAPTURED_STATES } from './moves'
import type { OpenCheckout, PaymentError } from './operations'
import { bookingById, paymentWhere, readPaymentSettings } from './records'
import { inTransaction, freshRequest, lockRow } from './store'
import type { ProcessGatewayEventWith } from './webhook'
import type { ParsedGatewayEvent } from './webhookEvent'

/**
 * Checkout at booking (docs/03 F3 step 4; docs/16 §5): one gateway order per held booking, its
 * amount the booking's own total as the server copied it at step 3, moving the booking to
 * `pendingPayment`. The browser gets the order id and the public key id, nothing more. On its
 * return the server checks the order with the gateway once; the browser's word confirms nothing.
 */

/** Razorpay takes no order under ₹1. */
const MIN_ORDER_PAISE = 100

/** The receipt of a booking's one checkout order: unique, so a second click finds the first. */
export const checkoutReceipt = (bookingId: number) => `booking:${bookingId}:checkout`

/** What the browser needs to open Razorpay's checkout, and nothing more. */
export type CheckoutParams = { keyId: string; orderId: string }

export function checkoutParams(opened: { orderId: string; keyId: string }): CheckoutParams {
  return { keyId: opened.keyId, orderId: opened.orderId }
}

const REUSABLE: readonly Payment['status'][] = ['created', 'authorized', 'failed']

export function makeOpenCheckout(deps: PaymentsDeps): OpenCheckout {
  return async (req, input) => {
    const gateway = deps.gateway()
    if (!gateway.ok) return gateway
    // Payment at booking needs the prices published (D-21, D-24); read on the server.
    if (!(await readPaymentSettings(req)).flags.payAtBooking) return err({ code: 'prices-hidden' })

    return inTransaction(req, async () => {
      if (!(await lockRow(req, 'bookings', input.bookingId))) return err({ code: 'not-found' })
      const booking = await bookingById(req, input.bookingId)
      if (!booking) return err({ code: 'not-found' })
      if (booking.status !== 'held' && booking.status !== 'pendingPayment') {
        return err({ code: 'bad-move', from: booking.status, to: 'pendingPayment' })
      }
      const holdEnds = booking.holdExpiresAt ? new Date(booking.holdExpiresAt) : null
      if (!holdEnds || holdEnds <= deps.now()) {
        // The hold has run out; B4 or the next hold moves it to `expired`.
        return err({ code: 'bad-move', from: 'expired', to: 'pendingPayment' })
      }
      const total = booking.price?.totalPaise ?? 0
      if (total <= 0) return err({ code: 'free-service' })
      if (total < MIN_ORDER_PAISE)
        return err({ code: 'refused', gatewayCode: 'BELOW_MINIMUM_AMOUNT' })

      const receipt = checkoutReceipt(booking.id)
      let payment = await paymentWhere(req, { receipt: { equals: receipt } })
      if (payment && !REUSABLE.includes(payment.status)) {
        return err({ code: 'bad-move', from: payment.status, to: 'created' })
      }
      if (!payment) {
        const order = await gateway.value.createOrder({
          amountPaise: total,
          receipt,
          notes: { receipt },
        })
        if (!order.ok) return order
        // The gateway echoes the amount; anything else is not an order the platform asked for.
        if (order.value.amountPaise !== total) return err({ code: 'unavailable' })
        payment = await req.payload.create({
          collection: 'payments',
          data: {
            booking: booking.id,
            kind: 'checkout',
            gateway: 'razorpay',
            status: 'created',
            amountPaise: total,
            currency: 'INR',
            refundedPaise: 0,
            receipt,
            gatewayOrderId: order.value.orderId,
          },
          overrideAccess: true,
          depth: 0,
          req,
        })
      }
      if (booking.status === 'held') {
        await req.payload.update({
          collection: 'bookings',
          id: booking.id,
          data: { status: 'pendingPayment' },
          overrideAccess: true,
          depth: 0,
          req,
        })
      }
      if (!payment.gatewayOrderId) return err({ code: 'unavailable' })
      return ok({ payment, orderId: payment.gatewayOrderId, keyId: gateway.value.publicKeyId })
    })
  }
}

/** A payment the gateway reports, as an event of the poll's (docs/16 §5: acted on once). */
export function eventFromGatewayPayment(
  found: GatewayPayment,
  kind: 'captured' | 'failed',
  prefix: 'poll' | 'reconcile',
): ParsedGatewayEvent {
  return {
    eventId: `${prefix}:${found.paymentId}:${kind}`,
    type: kind === 'captured' ? 'payment.captured' : 'payment.failed',
    gatewayOrderId: found.orderId,
    gatewayPaymentId: found.paymentId,
    gatewayPaymentLinkId: null,
    gatewayRefundId: null,
    amountPaise: found.amountPaise,
    // The gateway's list carries no currency; every order the platform makes is in rupees.
    currency: null,
    method: found.method,
    errorCode: found.errorCode,
    refundReceipt: null,
  }
}

export type VerifyReturnedPayment = (
  payload: Payload,
  input: { bookingId: number; orderId: string; paymentId: string; signature: string },
) => Promise<Result<{ paymentStatus: Payment['status'] }, PaymentError>>

/**
 * Server-side verification when the browser comes back from checkout (docs/16 §5): asks the
 * gateway once for the order's payments and processes a capture it finds, under the same event
 * id the order-status poll would use, so it is acted on once whichever comes first. The checkout
 * signature is checked first, and only as a gate: without it nothing is asked of the gateway and
 * the page waits for the webhook. Runs in transactions of its own; call it outside any other.
 */
export function makeVerifyReturnedPayment(
  deps: PaymentsDeps,
  processGatewayEvent: ProcessGatewayEventWith,
  sendRefunds: (payload: Payload, refundIds: number[]) => Promise<void>,
): VerifyReturnedPayment {
  return async (payload, input) => {
    const gateway = deps.gateway()
    if (!gateway.ok) return gateway
    const req = await freshRequest(payload)
    const payment = await paymentWhere(req, {
      and: [
        { booking: { equals: input.bookingId } },
        { gatewayOrderId: { equals: input.orderId } },
      ],
    })
    if (!payment) return err({ code: 'not-found' })
    if (CAPTURED_STATES.includes(payment.status)) return ok({ paymentStatus: payment.status })
    const signed = gateway.value.verifyCheckout({
      orderId: input.orderId,
      paymentId: input.paymentId,
      signature: input.signature,
    })
    if (!signed) return ok({ paymentStatus: payment.status })
    const found = await gateway.value.fetchOrderPayments(input.orderId)
    // No answer: the webhook, or the poll, settles it.
    if (!found.ok) return ok({ paymentStatus: payment.status })
    for (const attempt of found.value) {
      if (attempt.status !== 'captured' && attempt.status !== 'refunded') continue
      const processed = await processGatewayEvent(
        await freshRequest(payload),
        eventFromGatewayPayment(attempt, 'captured', 'poll'),
        'poll',
      )
      if (processed.ok) await sendRefunds(payload, processed.value.refundsToSend)
    }
    const after = await paymentWhere(await freshRequest(payload), { id: { equals: payment.id } })
    return ok({ paymentStatus: after?.status ?? payment.status })
  }
}
