import type { PayloadRequest } from 'payload'

import type { Result } from '@/lib/result'
import type { Payment, Refund } from '@/payload-types'

import type { GatewayError } from './gateway'
import type { Paise } from './money'

/**
 * The payment operations other modules call (docs/16 §5), as contracts: the payments builder
 * implements each in src/lib/payments/ ('server-only'), inside the request's transaction. A
 * payment is confirmed only by a verified webhook or a server-side verification of the order,
 * processed once by event id (CLAUDE.md #5); the browser's return from checkout confirms nothing.
 */

export type PaymentError =
  | GatewayError
  | { code: 'prices-hidden' } // pay_at_booking is off, or prices_public is (D-21, D-24)
  | { code: 'free-service' } // a payment link is never sent for a free service (B13)
  | { code: 'bad-move'; from: string; to: string } // not in PAYMENT_MOVES or REFUND_MOVES
  | { code: 'over-refund'; refundablePaise: Paise }
  | { code: 'needs-owner' } // above the threshold in Settings, or no threshold set
  | { code: 'not-found' }

/**
 * Opens checkout for a held booking (docs/03 F3 step 4): one gateway order per booking, its
 * amount the booking's own total from the server, moving the booking to `pendingPayment`. The
 * same booking returns the same order (Payments.receipt is unique).
 */
export type OpenCheckout = (
  req: PayloadRequest,
  input: { bookingId: number },
) => Promise<Result<{ payment: Payment; orderId: string; keyId: string }, PaymentError>>

/** Sends a payment link for a confirmed booking (D-24, B13); staff only, never for a free service. */
export type SendPaymentLink = (
  req: PayloadRequest,
  input: { bookingId: number; expiresAt: Date | null },
) => Promise<Result<{ payment: Payment; shortUrl: string }, PaymentError>>

/**
 * A webhook event after its signature was verified on the raw body and its body parsed with Zod
 * (docs/16 §5). Only these fields leave the parser.
 */
export type VerifiedGatewayEvent = {
  eventId: string // Razorpay's X-Razorpay-Event-Id
  type:
    | 'payment.authorized'
    | 'payment.captured'
    | 'payment.failed'
    | 'order.paid'
    | 'refund.processed'
    | 'refund.failed'
    | 'payment_link.paid'
    | 'payment_link.expired'
    | 'payment_link.cancelled'
  gatewayOrderId: string | null
  gatewayPaymentId: string | null
  gatewayPaymentLinkId: string | null
  gatewayRefundId: string | null
  amountPaise: Paise | null
  method: string | null
  errorCode: string | null
}

/**
 * Processes one event once: stores it under (gateway, eventId) in the same transaction that acts
 * on it; an event already stored is a replay and does nothing (`replay`). A capture confirms the
 * booking through ConfirmBooking; when the slot was taken meanwhile, it requests the automatic
 * full refund (B10) and flags the event.
 */
export type ProcessGatewayEvent = (
  req: PayloadRequest,
  event: VerifiedGatewayEvent,
  source: 'webhook' | 'poll' | 'reconciliation',
) => Promise<Result<{ outcome: 'processed' | 'ignored' | 'flagged' | 'replay' }, PaymentError>>

/**
 * Asks the gateway for the payments on orders still pending (the order-status poll, docs/07),
 * and processes any capture it finds as an event of source `poll`. Runs as a job (M3 owns it).
 */
export type PollPendingOrders = (req: PayloadRequest, now: Date) => Promise<{ checked: number }>

/**
 * Compares the gateway's captured payments and refunds of a day with the platform's (B11): a
 * capture with no payment, a payment with no booking, a refund made in the gateway's dashboard.
 * Each mismatch is stored as an event of source `reconciliation` and flagged for the office.
 */
export type ReconcileDay = (
  req: PayloadRequest,
  window: { from: Date; to: Date },
) => Promise<{ checked: number; flagged: number }>

/**
 * Requests a refund of a captured payment (docs/05, Money): `approved` at once when the amount is
 * within the threshold in Settings and the requester may approve it, else `awaitingApproval` for
 * an owner. The platform's own request (B10, `by: 'platform'`) is approved at once.
 */
export type RequestRefund = (
  req: PayloadRequest,
  input: {
    paymentId: number
    amountPaise: Paise
    reason: Refund['reason']
    reasonNote?: string
    idempotencyKey: string
    by: 'staff' | 'platform'
  },
) => Promise<Result<Refund, PaymentError>>

/** An owner approves or declines a refund awaiting approval; approval sends it to the gateway. */
export type DecideRefund = (
  req: PayloadRequest,
  input: { refundId: number; decision: 'approve' | 'decline'; note?: string },
) => Promise<Result<Refund, PaymentError>>
