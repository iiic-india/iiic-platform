import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { err, ok, type Result } from '@/lib/result'

import type {
  CreateOrder,
  CreatePaymentLink,
  CreateRefund,
  GatewayError,
  GatewayOrder,
  GatewayPayment,
  GatewayPaymentLink,
  GatewayRefund,
  PaymentGateway,
} from './gateway'

/** A webhook the fake would send: the raw body, its signature and its event id, as Razorpay's. */
export type FakeWebhook = { rawBody: string; signature: string; eventId: string }

const id = (prefix: string) => `${prefix}_fake${randomBytes(7).toString('hex')}`

function sign(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}

function sameHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex')
  const right = Buffer.from(b, 'hex')
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right)
}

/**
 * An in-memory gateway for tests (docs/16 §11): orders, payments, links and refunds kept in maps,
 * and webhooks shaped and signed as Razorpay signs them (HMAC-SHA256 of the raw body under the
 * webhook secret), so the webhook route is tested through its real signature check. Its ids say
 * "fake" and its secret is the test's own. Never chosen outside tests (docs/16 §11).
 */
export class FakeGateway implements PaymentGateway {
  readonly name = 'fake' as const
  readonly testMode = true
  readonly publicKeyId = 'rzp_test_fakekey'

  readonly orders = new Map<string, GatewayOrder>()
  readonly payments = new Map<string, GatewayPayment>()
  readonly links = new Map<string, GatewayPaymentLink & { amountPaise: number }>()
  readonly refunds = new Map<string, GatewayRefund>()
  private readonly orderByReceipt = new Map<string, string>()
  /** Makes every call fail as the gateway would while it is down, until set back. */
  down = false

  constructor(private readonly webhookSecret = 'fake-webhook-secret-for-tests-only') {}

  private check(): GatewayError | null {
    return this.down ? { code: 'unavailable' } : null
  }

  async createOrder(order: CreateOrder): Promise<Result<GatewayOrder, GatewayError>> {
    const failure = this.check()
    if (failure) return err(failure)
    // One order per receipt, as the platform asks the real gateway (Payments.receipt is unique).
    const existing = this.orderByReceipt.get(order.receipt)
    if (existing) return ok(this.orders.get(existing) as GatewayOrder)
    const created = { orderId: id('order'), amountPaise: order.amountPaise, status: 'created' }
    this.orders.set(created.orderId, created)
    this.orderByReceipt.set(order.receipt, created.orderId)
    return ok(created)
  }

  async fetchOrderPayments(orderId: string): Promise<Result<GatewayPayment[], GatewayError>> {
    const failure = this.check()
    if (failure) return err(failure)
    if (!this.orders.has(orderId)) return err({ code: 'not-found' })
    return ok([...this.payments.values()].filter((payment) => payment.orderId === orderId))
  }

  async createPaymentLink(
    link: CreatePaymentLink,
  ): Promise<Result<GatewayPaymentLink, GatewayError>> {
    const failure = this.check()
    if (failure) return err(failure)
    const linkId = id('plink')
    const created = {
      linkId,
      shortUrl: `https://example.invalid/pay/${linkId}`,
      status: 'created',
      amountPaise: link.amountPaise,
    }
    this.links.set(linkId, created)
    return ok(created)
  }

  async cancelPaymentLink(linkId: string): Promise<Result<void, GatewayError>> {
    const link = this.links.get(linkId)
    if (!link) return err({ code: 'not-found' })
    link.status = 'cancelled'
    return ok(undefined)
  }

  async refund(refund: CreateRefund): Promise<Result<GatewayRefund, GatewayError>> {
    const failure = this.check()
    if (failure) return err(failure)
    const payment = this.payments.get(refund.paymentId)
    if (!payment || payment.status !== 'captured') {
      return err({ code: 'refused', gatewayCode: 'BAD_REQUEST_ERROR' })
    }
    const created: GatewayRefund = {
      refundId: id('rfnd'),
      paymentId: refund.paymentId,
      amountPaise: refund.amountPaise,
      status: 'processed',
    }
    this.refunds.set(created.refundId, created)
    return ok(created)
  }

  async listPayments(window: {
    from: Date
    to: Date
  }): Promise<Result<GatewayPayment[], GatewayError>> {
    const failure = this.check()
    if (failure) return err(failure)
    return ok(
      [...this.payments.values()].filter(
        (payment) => payment.createdAt >= window.from && payment.createdAt < window.to,
      ),
    )
  }

  verifyWebhook(rawBody: string, signature: string): boolean {
    return sameHex(sign(this.webhookSecret, rawBody), signature)
  }

  verifyCheckout(input: { orderId: string; paymentId: string; signature: string }): boolean {
    return sameHex(sign(this.webhookSecret, `${input.orderId}|${input.paymentId}`), input.signature)
  }

  /**
   * The test's stand-in for a client paying at checkout: a captured (or failed) payment on the
   * order, and the `payment.captured` (or `payment.failed`) webhook Razorpay would send, signed.
   */
  pay(orderId: string, outcome: 'captured' | 'failed' = 'captured'): FakeWebhook {
    const order = this.orders.get(orderId)
    if (!order) throw new Error('The fake gateway has no such order.')
    const payment: GatewayPayment = {
      paymentId: id('pay'),
      orderId,
      amountPaise: order.amountPaise,
      status: outcome,
      method: 'upi',
      errorCode: outcome === 'failed' ? 'BAD_REQUEST_ERROR' : null,
      createdAt: new Date(),
    }
    this.payments.set(payment.paymentId, payment)
    if (outcome === 'captured') order.status = 'paid'
    return this.webhook(`payment.${outcome}`, {
      payment: {
        entity: {
          id: payment.paymentId,
          order_id: orderId,
          amount: payment.amountPaise,
          currency: 'INR',
          status: outcome,
          method: payment.method,
          error_code: payment.errorCode,
        },
      },
    })
  }

  /** A webhook body as Razorpay shapes it, signed with the fake's secret. */
  webhook(event: string, payload: Record<string, unknown>): FakeWebhook {
    const eventId = id('evt')
    const rawBody = JSON.stringify({
      entity: 'event',
      event,
      contains: Object.keys(payload),
      payload,
      created_at: Math.floor(Date.now() / 1000),
    })
    return { rawBody, signature: sign(this.webhookSecret, rawBody), eventId }
  }
}
