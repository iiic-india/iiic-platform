import { err, ok, type Result } from '@/lib/result'

import type { Paise } from './money'
import { PAYMENT_MOVES, REFUND_MOVES, type PaymentStatus, type RefundStatus } from './states'

/**
 * The payment's and the refund's state machines (docs/16 §3), applied: a move is allowed only
 * when src/lib/payments/states.ts lists it. Standing still is not a move, so a repeated or late
 * event never counts as one. The collections refuse any other move as well (Payments.ts,
 * Refunds.ts), whoever writes.
 */

export type BadMove = { code: 'bad-move'; from: string; to: string }

function allowed<S extends string>(
  moves: Partial<Record<S, readonly S[]>>,
  from: S,
  to: S,
): boolean {
  return (moves[from] ?? []).includes(to)
}

export function paymentMove(
  from: PaymentStatus,
  to: PaymentStatus,
): Result<PaymentStatus, BadMove> {
  return allowed<PaymentStatus>(PAYMENT_MOVES, from, to)
    ? ok(to)
    : err({ code: 'bad-move', from, to })
}

export function refundMove(from: RefundStatus, to: RefundStatus): Result<RefundStatus, BadMove> {
  return allowed<RefundStatus>(REFUND_MOVES, from, to)
    ? ok(to)
    : err({ code: 'bad-move', from, to })
}

/** A captured payment's state once this much of it has gone back. */
export function paymentStatusAfterRefund(payment: {
  amountPaise: Paise
  refundedPaise: Paise
}): 'partRefunded' | 'refunded' {
  if (payment.refundedPaise > payment.amountPaise) {
    throw new RangeError('A payment cannot be refunded past its amount')
  }
  return payment.refundedPaise === payment.amountPaise ? 'refunded' : 'partRefunded'
}

/** The states in which money has been taken on a payment. */
export const CAPTURED_STATES: readonly PaymentStatus[] = ['captured', 'partRefunded', 'refunded']

/**
 * Refund states that still count against what a payment can give back: everything but declined
 * and processed (which is already in `refundedPaise`). A failed refund counts too, because it is
 * sent again by hand rather than replaced, so its money is never promised twice.
 */
export const OPEN_REFUND_STATES: readonly RefundStatus[] = [
  'requested',
  'awaitingApproval',
  'approved',
  'processing',
  'failed',
]
