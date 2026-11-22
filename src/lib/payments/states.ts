/**
 * The states of a payment, a refund and an invoice, and the moves between them
 * (docs/16-booking-and-payments-design.md §3). The collections' select options come from these
 * lists. Who makes a move, and when, belongs to the payments builder; this file holds the
 * vocabulary and the table of allowed moves only.
 */

/**
 * A payment is one gateway order (checkout at booking) or one payment link (D-24), with the
 * captured payment on it. Only a verified webhook, a server-side verification or the daily
 * reconciliation moves it (CLAUDE.md #5).
 */
export const PAYMENT_STATUSES = [
  { value: 'created', label: 'Created' },
  { value: 'authorized', label: 'Authorised' },
  { value: 'captured', label: 'Captured' },
  { value: 'failed', label: 'Failed' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'partRefunded', label: 'Partly refunded' },
  { value: 'refunded', label: 'Refunded' },
] as const

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]['value']

export const PAYMENT_MOVES = {
  created: ['authorized', 'captured', 'failed', 'expired', 'cancelled'],
  authorized: ['captured', 'failed'],
  // An order whose first attempt failed can still be paid by a second one.
  failed: ['authorized', 'captured', 'expired', 'cancelled'],
  captured: ['partRefunded', 'refunded'],
  partRefunded: ['partRefunded', 'refunded'],
} as const satisfies Partial<Record<PaymentStatus, readonly PaymentStatus[]>>

/** How a payment was asked for: checkout in the booking flow, or a link staff send (D-24). */
export const PAYMENT_KINDS = [
  { value: 'checkout', label: 'Checkout at booking' },
  { value: 'paymentLink', label: 'Payment link' },
] as const

export type PaymentKind = (typeof PAYMENT_KINDS)[number]['value']

/** Gateways the platform takes payments through: Razorpay (D-12). */
export const GATEWAYS = [{ value: 'razorpay', label: 'Razorpay' }] as const

export type Gateway = (typeof GATEWAYS)[number]['value']

/**
 * A refund (docs/05, Money: request with reason → approval if above the threshold → processed
 * through the gateway to the original payment method → status).
 */
export const REFUND_STATUSES = [
  { value: 'requested', label: 'Requested' },
  { value: 'awaitingApproval', label: 'Awaiting an owner' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
  { value: 'processing', label: 'Sent to the gateway' },
  { value: 'processed', label: 'Refunded' },
  { value: 'failed', label: 'Failed' },
] as const

export type RefundStatus = (typeof REFUND_STATUSES)[number]['value']

export const REFUND_MOVES = {
  requested: ['approved', 'awaitingApproval'],
  awaitingApproval: ['approved', 'declined'],
  approved: ['processing'],
  processing: ['processed', 'failed'],
  // A refund the gateway refused is sent again by hand, never by itself.
  failed: ['processing'],
} as const satisfies Partial<Record<RefundStatus, readonly RefundStatus[]>>

/** Why money goes back (docs/03 F3, docs/06 B7, B10). */
export const REFUND_REASONS = [
  { value: 'cancelledByClient', label: 'Cancelled by the client' },
  { value: 'cancelledByIiic', label: 'Cancelled by IIIC' },
  { value: 'slotTaken', label: 'The time was taken before the payment arrived' },
  { value: 'other', label: 'Other (say why)' },
] as const

/**
 * The documents Zoho Books issues (D-13; src/brand/templates/print/invoice.html). IIIC is
 * GST-registered, so the first four apply; which one a payment gets is the CA's call (I-29).
 */
export const INVOICE_KINDS = [
  { value: 'taxInvoice', label: 'Tax invoice' },
  { value: 'receiptVoucher', label: 'Receipt voucher' },
  { value: 'refundVoucher', label: 'Refund voucher' },
  { value: 'creditNote', label: 'Credit note' },
] as const

export type InvoiceKind = (typeof INVOICE_KINDS)[number]['value']

/** The mirror's own state: asked of Zoho Books, issued by it, or refused (and retried). */
export const INVOICE_STATUSES = [
  { value: 'pending', label: 'Waiting for Zoho Books' },
  { value: 'issued', label: 'Issued' },
  { value: 'failed', label: 'Failed (retrying)' },
  { value: 'void', label: 'Void in Zoho Books' },
] as const

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]['value']

/** Where a gateway event came from: its webhook, the order-status poll, or reconciliation. */
export const GATEWAY_EVENT_SOURCES = [
  { value: 'webhook', label: 'Webhook' },
  { value: 'poll', label: 'Order-status poll' },
  { value: 'reconciliation', label: 'Daily reconciliation' },
] as const

/** What processing an event did. An event is stored once and processed once. */
export const GATEWAY_EVENT_OUTCOMES = [
  { value: 'processed', label: 'Processed' },
  { value: 'ignored', label: 'Ignored (nothing to do)' },
  { value: 'flagged', label: 'Flagged for the office' },
] as const
