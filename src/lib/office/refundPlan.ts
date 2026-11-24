import { err, ok, type Result } from '@/lib/result'

/**
 * How a cancellation's refund is taken from the payments on a booking (docs/16 §5): a reschedule
 * keeps the payment on the first booking, and a booking may carry more than one (a link paid
 * after a checkout failed), so the refund the policy gives is spread over them, the latest
 * first, never more from one than it can still give back. Pure; the payments module still checks
 * each request against the payment itself.
 */

export type Refundable = { paymentId: number; refundablePaise: number }
export type RefundPart = { paymentId: number; amountPaise: number }

export function splitRefund(
  totalPaise: number,
  payments: readonly Refundable[],
): Result<RefundPart[], { code: 'over-refund'; refundablePaise: number }> {
  if (!Number.isInteger(totalPaise) || totalPaise < 0) {
    throw new RangeError('A refund is a whole, non-negative number of paise.')
  }
  const available = payments.reduce((sum, payment) => sum + Math.max(0, payment.refundablePaise), 0)
  if (totalPaise > available) return err({ code: 'over-refund', refundablePaise: available })
  const parts: RefundPart[] = []
  let left = totalPaise
  for (const payment of payments) {
    if (left === 0) break
    const amountPaise = Math.min(left, Math.max(0, payment.refundablePaise))
    if (amountPaise === 0) continue
    parts.push({ paymentId: payment.paymentId, amountPaise })
    left -= amountPaise
  }
  return ok(parts)
}

/** The key of a cancellation's refund from one payment: one cancellation, one refund each. */
export const cancellationRefundKey = (bookingId: number, paymentId: number): string =>
  `cancel:${bookingId}:${paymentId}`
