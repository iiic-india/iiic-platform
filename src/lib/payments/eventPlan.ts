import type { Paise } from './money'
import { CAPTURED_STATES, paymentMove, refundMove } from './moves'
import type { PaymentStatus, RefundStatus } from './states'
import type { ParsedGatewayEvent } from './webhookEvent'

/**
 * What a verified gateway event does (docs/16 §5), decided without the database so every case
 * is tested on its own: the webhook, the poll and the reconciliation act on the plan inside the
 * event's transaction (src/lib/payments/webhook.ts). A plan either moves the payment or the
 * refund along its state machine (`processed`), changes nothing (`ignored`: a repeated or late
 * event), or changes nothing and asks the office to look (`flagged`: money that does not match).
 * A capture whose amount or currency differs from the payment's is flagged and confirms nothing.
 */

/** The parts of a payment a plan reads. */
export type PaymentFacts = {
  status: PaymentStatus
  amountPaise: Paise
  currency: string
  gatewayPaymentId: string | null
  refundedPaise: Paise
}

/** The parts of a refund a plan reads. */
export type RefundFacts = {
  status: RefundStatus
  amountPaise: Paise
  gatewayRefundId: string | null
}

/** Short codes stored on the event's `note` (never a payload, never a name). */
export type EventNote =
  | 'unknown-order'
  | 'unknown-refund'
  | 'currency-mismatch'
  | 'amount-mismatch'
  | 'already-captured'
  | 'already-authorized'
  | 'already-failed'
  | 'already-closed'
  | 'already-processed'
  | 'second-capture'
  | 'payment-closed'
  | 'out-of-order'
  | 'over-refund'
  | 'refund-not-approved'

type Unchanged = { outcome: 'ignored' | 'flagged'; note: EventNote }

export type PaymentPlan = Unchanged | { outcome: 'processed'; to: PaymentStatus }
export type RefundPlan = Unchanged | { outcome: 'processed'; steps: RefundStatus[] }

const ignored = (note: EventNote): Unchanged => ({ outcome: 'ignored', note })
const flagged = (note: EventNote): Unchanged => ({ outcome: 'flagged', note })

const CAPTURES = new Set<ParsedGatewayEvent['type']>([
  'payment.captured',
  'order.paid',
  'payment_link.paid',
])

const isCaptured = (status: PaymentStatus) => CAPTURED_STATES.includes(status)

function planCapture(event: ParsedGatewayEvent, payment: PaymentFacts): PaymentPlan {
  if (event.amountPaise !== payment.amountPaise) return flagged('amount-mismatch')
  if (isCaptured(payment.status)) {
    const same = !payment.gatewayPaymentId || payment.gatewayPaymentId === event.gatewayPaymentId
    return same ? ignored('already-captured') : flagged('second-capture')
  }
  return paymentMove(payment.status, 'captured').ok
    ? { outcome: 'processed', to: 'captured' }
    : flagged('payment-closed')
}

function planAuthorized(event: ParsedGatewayEvent, payment: PaymentFacts): PaymentPlan {
  if (event.amountPaise !== payment.amountPaise) return flagged('amount-mismatch')
  if (isCaptured(payment.status)) return ignored('out-of-order')
  if (payment.status === 'authorized') return ignored('already-authorized')
  return paymentMove(payment.status, 'authorized').ok
    ? { outcome: 'processed', to: 'authorized' }
    : flagged('payment-closed')
}

function planClosing(payment: PaymentFacts, to: 'failed' | 'expired' | 'cancelled'): PaymentPlan {
  if (payment.status === to) return ignored(to === 'failed' ? 'already-failed' : 'already-closed')
  return paymentMove(payment.status, to).ok ? { outcome: 'processed', to } : ignored('out-of-order')
}

/** A payment event: a capture, an authorisation, a failure, or a link that expired or was cancelled. */
export function planPaymentEvent(
  event: ParsedGatewayEvent,
  payment: PaymentFacts | null,
): PaymentPlan {
  if (!payment) return ignored('unknown-order')
  if (event.currency !== null && event.currency !== payment.currency) {
    return flagged('currency-mismatch')
  }
  if (CAPTURES.has(event.type)) return planCapture(event, payment)
  switch (event.type) {
    case 'payment.authorized':
      return planAuthorized(event, payment)
    case 'payment.failed':
      return planClosing(payment, 'failed')
    case 'payment_link.expired':
      return planClosing(payment, 'expired')
    case 'payment_link.cancelled':
      return planClosing(payment, 'cancelled')
    default:
      return ignored('out-of-order')
  }
}

/** The steps from where a refund stands to `target`, or null when the machine has no such path. */
function stepsTo(from: RefundStatus, target: 'processed' | 'failed'): RefundStatus[] | null {
  if (refundMove(from, target).ok) return [target]
  if (refundMove(from, 'processing').ok && refundMove('processing', target).ok) {
    return ['processing', target]
  }
  return null
}

/** A refund event: the gateway processed or refused a refund. */
export function planRefundEvent(
  event: ParsedGatewayEvent,
  refund: RefundFacts | null,
  payment: PaymentFacts | null,
): RefundPlan {
  if (!refund) return flagged('unknown-refund')
  if (event.currency !== null && payment && event.currency !== payment.currency) {
    return flagged('currency-mismatch')
  }
  if (event.type === 'refund.processed') {
    if (refund.status === 'processed') return ignored('already-processed')
    if (event.amountPaise !== refund.amountPaise) return flagged('amount-mismatch')
    if (payment && payment.refundedPaise + refund.amountPaise > payment.amountPaise) {
      return flagged('over-refund')
    }
    const steps = stepsTo(refund.status, 'processed')
    return steps ? { outcome: 'processed', steps } : flagged('refund-not-approved')
  }
  if (refund.status === 'failed') return ignored('already-failed')
  if (refund.status === 'processed') return ignored('out-of-order')
  const steps = stepsTo(refund.status, 'failed')
  return steps ? { outcome: 'processed', steps } : flagged('refund-not-approved')
}
