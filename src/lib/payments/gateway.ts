import type { Result } from '@/lib/result'

import type { Paise } from './money'

/**
 * The payment gateway as the platform uses it (docs/16 §5): Razorpay in test and live mode through
 * its official Node SDK (`razorpay`, pinned), and an in-memory fake for tests
 * (src/lib/payments/fakeGateway.ts). The payments builder writes the Razorpay implementation in
 * src/lib/payments/razorpay.ts ('server-only'), which checks every answer with Zod before the
 * platform trusts it and checks signatures with the SDK's own validateWebhookSignature, never a
 * hand-made comparison. Nothing here logs a payload, a contact detail or a card detail.
 */

/** A failure from the gateway, by kind; the gateway's own message is never shown or logged. */
export type GatewayError =
  | { code: 'not-configured' }
  | { code: 'unavailable' } // network or 5xx: the flow keeps the hold for one retry (docs/03 F3)
  | { code: 'refused'; gatewayCode: string } // 4xx with the gateway's error code
  | { code: 'not-found' }

/** An order for checkout at booking. `receipt` is the payment's own unique key (Payments.receipt). */
export type CreateOrder = { amountPaise: Paise; receipt: string; notes: Record<string, string> }
export type GatewayOrder = { orderId: string; amountPaise: Paise; status: string }

/** A payment link staff send (D-24, B13); its amount is stated to the client before they pay. */
export type CreatePaymentLink = {
  amountPaise: Paise
  receipt: string
  description: string
  expiresAt: Date | null
  /** Sent by the platform's own messages (M6), never by the gateway's SMS or email. */
  notify: false
}
export type GatewayPaymentLink = { linkId: string; shortUrl: string; status: string }

/** A payment as the gateway reports it: ids, amount, state and method, nothing about the payer. */
export type GatewayPayment = {
  paymentId: string
  orderId: string | null
  amountPaise: Paise
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed'
  method: string | null
  errorCode: string | null
  createdAt: Date
}

export type CreateRefund = { paymentId: string; amountPaise: Paise; receipt: string }
export type GatewayRefund = {
  refundId: string
  paymentId: string
  amountPaise: Paise
  status: 'pending' | 'processed' | 'failed'
}

export interface PaymentGateway {
  readonly name: 'razorpay' | 'fake'
  /** True for test keys (`rzp_test_`) and the fake; a live key is refused off production. */
  readonly testMode: boolean
  /** The key id checkout needs in the browser; never the secret. */
  readonly publicKeyId: string
  createOrder(order: CreateOrder): Promise<Result<GatewayOrder, GatewayError>>
  /** The payments made against an order: the order-status poll and server-side verification. */
  fetchOrderPayments(orderId: string): Promise<Result<GatewayPayment[], GatewayError>>
  createPaymentLink(link: CreatePaymentLink): Promise<Result<GatewayPaymentLink, GatewayError>>
  cancelPaymentLink(linkId: string): Promise<Result<void, GatewayError>>
  /** Always to the original payment method (docs/08 §4). */
  refund(refund: CreateRefund): Promise<Result<GatewayRefund, GatewayError>>
  /** Payments captured in a window, for the daily reconciliation (B11). */
  listPayments(window: { from: Date; to: Date }): Promise<Result<GatewayPayment[], GatewayError>>
  /** The webhook's signature over the raw body, before anything is parsed (docs/08 §9). */
  verifyWebhook(rawBody: string, signature: string): boolean
  /** Checkout's handler signature over order id and payment id: a hint for the page, never proof. */
  verifyCheckout(input: { orderId: string; paymentId: string; signature: string }): boolean
}
