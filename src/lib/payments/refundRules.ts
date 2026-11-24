import { randomBytes } from 'node:crypto'

import type { PayloadRequest } from 'payload'

import { err, ok, type Result } from '@/lib/result'
import type { Payment } from '@/payload-types'

import type { Paise } from './money'
import { CAPTURED_STATES, OPEN_REFUND_STATES } from './moves'
import type { PaymentError } from './operations'

/**
 * The rules a refund is asked for under (docs/05, Money; docs/16 §5), shared by the payments
 * module and the refunds collection's own checks (src/collections/Refunds.ts). The collection's
 * hooks use them, so this module stays free of `server-only`: the Payload CLI loads it too
 * (src/lib/env.ts says why). It holds no secret and calls no gateway.
 */

/** Razorpay's smallest refund: ₹1. */
export const MIN_REFUND_PAISE = 100

/** Keys go to the gateway as the refund's receipt: short, and plain characters only. */
export const REFUND_KEY = /^[A-Za-z0-9:_-]{1,40}$/

/** A key for a refund the office asks for by hand (the API, the admin). */
export function staffRefundKey(): string {
  return `staff:${randomBytes(12).toString('hex')}`
}

/**
 * Whether a refund is approved when it is asked for (docs/05: "approval if above the threshold").
 * The platform's own refund for a lost slot (B10) is approved at once; any other is approved at
 * once only when a threshold is set and the amount is at or below it. With no threshold, every
 * refund waits for an owner (docs/16 §10).
 */
export function statusOnRequest(input: {
  by: 'staff' | 'platform'
  amountPaise: Paise
  thresholdPaise: Paise | null
}): 'approved' | 'awaitingApproval' {
  if (input.by === 'platform') return 'approved'
  return input.thresholdPaise !== null && input.amountPaise <= input.thresholdPaise
    ? 'approved'
    : 'awaitingApproval'
}

/** Whether money can still go back on a payment: captured, and not all of it refunded. */
export function refundableState(payment: Pick<Payment, 'status'>): Result<true, PaymentError> {
  if (!CAPTURED_STATES.includes(payment.status) || payment.status === 'refunded') {
    return err({ code: 'bad-move', from: payment.status, to: 'refunded' })
  }
  return ok(true)
}

/** A refund's amount: whole paise, at least the gateway's smallest. */
export function refundAmountAllowed(amountPaise: unknown): amountPaise is number {
  return Number.isInteger(amountPaise) && (amountPaise as number) >= MIN_REFUND_PAISE
}

/**
 * What is left to give back on a payment: its amount, less what went back and what other
 * refunds have promised (`except` leaves one refund out, when it is the one being decided).
 */
export async function refundablePaise(
  req: PayloadRequest,
  payment: Pick<Payment, 'id' | 'amountPaise' | 'refundedPaise'>,
  except?: number,
): Promise<Paise> {
  const { docs } = await req.payload.find({
    collection: 'refunds',
    where: {
      and: [
        { payment: { equals: payment.id } },
        { status: { in: [...OPEN_REFUND_STATES] } },
        ...(except === undefined ? [] : [{ id: { not_equals: except } }]),
      ],
    },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const promised = docs.reduce((sum, refund) => sum + refund.amountPaise, 0)
  return Math.max(0, payment.amountPaise - (payment.refundedPaise ?? 0) - promised)
}
