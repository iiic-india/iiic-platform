// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { planPaymentEvent, planRefundEvent, type PaymentFacts } from '@/lib/payments/eventPlan'
import type { ParsedGatewayEvent } from '@/lib/payments/webhookEvent'

// What each verified gateway event does to the payment or the refund it names (docs/16 §5):
// a capture is acted on once, a late or repeated event changes nothing, and an amount or a
// currency that differs from the payment's is flagged and confirms nothing. Fake values only.

const event = (
  type: ParsedGatewayEvent['type'],
  extra: Partial<ParsedGatewayEvent> = {},
): ParsedGatewayEvent => ({
  eventId: 'evt_fake',
  type,
  gatewayOrderId: 'order_fake',
  gatewayPaymentId: 'pay_fake2',
  gatewayPaymentLinkId: null,
  gatewayRefundId: null,
  amountPaise: 50_000,
  currency: 'INR',
  method: 'upi',
  errorCode: null,
  refundReceipt: null,
  ...extra,
})

const payment = (extra: Partial<PaymentFacts> = {}): PaymentFacts => ({
  status: 'created',
  amountPaise: 50_000,
  currency: 'INR',
  gatewayPaymentId: null,
  refundedPaise: 0,
  ...extra,
})

describe('a capture', () => {
  it.each(['payment.captured', 'order.paid', 'payment_link.paid'] as const)(
    '%s captures a payment waiting for it',
    (type) => {
      for (const status of ['created', 'authorized', 'failed'] as const) {
        expect(planPaymentEvent(event(type), payment({ status }))).toEqual({
          outcome: 'processed',
          to: 'captured',
        })
      }
    },
  )

  it('is ignored when the same payment was captured already (a second event for it)', () => {
    expect(
      planPaymentEvent(
        event('order.paid'),
        payment({ status: 'captured', gatewayPaymentId: 'pay_fake2' }),
      ),
    ).toEqual({ outcome: 'ignored', note: 'already-captured' })
    expect(
      planPaymentEvent(
        event('payment.captured'),
        payment({ status: 'refunded', gatewayPaymentId: 'pay_fake2' }),
      ),
    ).toEqual({ outcome: 'ignored', note: 'already-captured' })
  })

  it('is flagged when another payment was captured on the same order', () => {
    expect(
      planPaymentEvent(
        event('payment.captured'),
        payment({ status: 'captured', gatewayPaymentId: 'pay_other' }),
      ),
    ).toEqual({ outcome: 'flagged', note: 'second-capture' })
  })

  it('is flagged, confirming nothing, when the amount differs from the payment’s', () => {
    for (const amountPaise of [49_999, 50_001, 0, null]) {
      expect(planPaymentEvent(event('payment.captured', { amountPaise }), payment())).toEqual({
        outcome: 'flagged',
        note: 'amount-mismatch',
      })
    }
  })

  it('is flagged, confirming nothing, when the currency differs from the payment’s', () => {
    expect(planPaymentEvent(event('payment.captured', { currency: 'USD' }), payment())).toEqual({
      outcome: 'flagged',
      note: 'currency-mismatch',
    })
  })

  it('is flagged when money arrives on a link or order already closed', () => {
    for (const status of ['expired', 'cancelled'] as const) {
      expect(planPaymentEvent(event('payment_link.paid'), payment({ status }))).toEqual({
        outcome: 'flagged',
        note: 'payment-closed',
      })
    }
  })

  it('is ignored when the platform has no such order (a link’s own order, or the dashboard’s)', () => {
    expect(planPaymentEvent(event('payment.captured'), null)).toEqual({
      outcome: 'ignored',
      note: 'unknown-order',
    })
  })
})

describe('events out of order', () => {
  it('ignores a failed attempt reported after the payment was captured', () => {
    expect(
      planPaymentEvent(
        event('payment.failed', { gatewayPaymentId: 'pay_first' }),
        payment({ status: 'captured', gatewayPaymentId: 'pay_fake2' }),
      ),
    ).toEqual({ outcome: 'ignored', note: 'out-of-order' })
  })

  it('ignores an authorisation reported after the capture', () => {
    expect(
      planPaymentEvent(
        event('payment.authorized'),
        payment({ status: 'captured', gatewayPaymentId: 'pay_fake2' }),
      ),
    ).toEqual({ outcome: 'ignored', note: 'out-of-order' })
  })

  it('takes a capture reported before its authorisation', () => {
    expect(planPaymentEvent(event('payment.captured'), payment({ status: 'created' }))).toEqual({
      outcome: 'processed',
      to: 'captured',
    })
  })

  it('records a failure, then still lets a second attempt capture', () => {
    expect(planPaymentEvent(event('payment.failed'), payment())).toEqual({
      outcome: 'processed',
      to: 'failed',
    })
    expect(planPaymentEvent(event('payment.failed'), payment({ status: 'failed' }))).toEqual({
      outcome: 'ignored',
      note: 'already-failed',
    })
  })

  it('ignores a link expiring after it was paid', () => {
    expect(
      planPaymentEvent(
        event('payment_link.expired', { amountPaise: null }),
        payment({ status: 'captured', gatewayPaymentId: 'pay_fake2' }),
      ),
    ).toEqual({ outcome: 'ignored', note: 'out-of-order' })
    expect(
      planPaymentEvent(event('payment_link.cancelled', { amountPaise: null }), payment()),
    ).toEqual({ outcome: 'processed', to: 'cancelled' })
  })
})

describe('refund events', () => {
  const refund = { status: 'processing' as const, amountPaise: 20_000, gatewayRefundId: 'rfnd_1' }
  const captured = payment({ status: 'captured', gatewayPaymentId: 'pay_fake2' })
  const processed = event('refund.processed', { amountPaise: 20_000, gatewayRefundId: 'rfnd_1' })

  it('completes a refund sent to the gateway, through processing when needed', () => {
    expect(planRefundEvent(processed, refund, captured)).toEqual({
      outcome: 'processed',
      steps: ['processed'],
    })
    expect(planRefundEvent(processed, { ...refund, status: 'approved' }, captured)).toEqual({
      outcome: 'processed',
      steps: ['processing', 'processed'],
    })
  })

  it('ignores the same refund processed again', () => {
    expect(planRefundEvent(processed, { ...refund, status: 'processed' }, captured)).toEqual({
      outcome: 'ignored',
      note: 'already-processed',
    })
  })

  it('flags a refund the platform never asked for, never approved, or for the wrong amount', () => {
    expect(planRefundEvent(processed, null, captured)).toEqual({
      outcome: 'flagged',
      note: 'unknown-refund',
    })
    expect(planRefundEvent(processed, { ...refund, status: 'awaitingApproval' }, captured)).toEqual(
      { outcome: 'flagged', note: 'refund-not-approved' },
    )
    expect(planRefundEvent({ ...processed, amountPaise: 20_001 }, refund, captured)).toEqual({
      outcome: 'flagged',
      note: 'amount-mismatch',
    })
  })

  it('flags a refund that would take back more than was paid', () => {
    expect(planRefundEvent(processed, refund, { ...captured, refundedPaise: 40_000 })).toEqual({
      outcome: 'flagged',
      note: 'over-refund',
    })
  })

  it('marks a refund the gateway refused as failed, and ignores a late failure', () => {
    const failed = event('refund.failed', { amountPaise: 20_000, gatewayRefundId: 'rfnd_1' })
    expect(planRefundEvent(failed, refund, captured)).toEqual({
      outcome: 'processed',
      steps: ['failed'],
    })
    expect(planRefundEvent(failed, { ...refund, status: 'processed' }, captured)).toEqual({
      outcome: 'ignored',
      note: 'out-of-order',
    })
  })
})
