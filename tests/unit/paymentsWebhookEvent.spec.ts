// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { FakeGateway } from '@/lib/payments/fakeGateway'
import { parseRazorpayEvent } from '@/lib/payments/webhookEvent'

// The webhook's parser (docs/16 §5): only the fields the platform needs leave it, never the
// payer's name, contact, card or address. Bodies are shaped as Razorpay shapes them; every id
// and value is fake.

const body = (event: string, payload: Record<string, unknown>) =>
  JSON.stringify({ entity: 'event', event, contains: Object.keys(payload), payload })

const payment = {
  id: 'pay_fake1',
  entity: 'payment',
  amount: 50_000,
  currency: 'INR',
  status: 'captured',
  order_id: 'order_fake1',
  method: 'upi',
  error_code: null,
  // What must never leave the parser:
  email: 'someone@example.invalid',
  contact: '+910000000000',
  vpa: 'someone@fakebank',
  notes: { anything: 'the payer typed' },
  card: { last4: '0000', name: 'Fake Payer' },
}

describe('parseRazorpayEvent', () => {
  it('takes a capture’s ids, amount, currency and method, and nothing about the payer', () => {
    const parsed = parseRazorpayEvent(
      body('payment.captured', { payment: { entity: payment } }),
      'evt_1',
    )
    expect(parsed).toEqual({
      ok: true,
      value: {
        eventId: 'evt_1',
        type: 'payment.captured',
        gatewayOrderId: 'order_fake1',
        gatewayPaymentId: 'pay_fake1',
        gatewayPaymentLinkId: null,
        gatewayRefundId: null,
        amountPaise: 50_000,
        currency: 'INR',
        method: 'upi',
        errorCode: null,
        refundReceipt: null,
      },
    })
    const leaked = JSON.stringify(parsed)
    for (const secret of [
      'example.invalid',
      '+910000000000',
      'fakebank',
      'payer typed',
      'Fake Payer',
    ]) {
      expect(leaked).not.toContain(secret)
    }
  })

  it('takes a failure’s error code, never its description', () => {
    const parsed = parseRazorpayEvent(
      body('payment.failed', {
        payment: {
          entity: {
            ...payment,
            status: 'failed',
            error_code: 'BAD_REQUEST_ERROR',
            error_description: 'Payment failed for Fake Payer',
          },
        },
      }),
      'evt_2',
    )
    expect(parsed.ok && parsed.value.errorCode).toBe('BAD_REQUEST_ERROR')
    expect(JSON.stringify(parsed)).not.toContain('Fake Payer')
  })

  it('reads order.paid from its order and its payment', () => {
    const parsed = parseRazorpayEvent(
      body('order.paid', {
        order: {
          entity: { id: 'order_fake1', amount: 50_000, amount_paid: 50_000, currency: 'INR' },
        },
        payment: { entity: payment },
      }),
      'evt_3',
    )
    expect(parsed.ok && parsed.value).toMatchObject({
      type: 'order.paid',
      gatewayOrderId: 'order_fake1',
      gatewayPaymentId: 'pay_fake1',
      amountPaise: 50_000,
    })
  })

  it('reads a refund’s id, payment, amount and our receipt', () => {
    const parsed = parseRazorpayEvent(
      body('refund.processed', {
        refund: {
          entity: {
            id: 'rfnd_fake1',
            payment_id: 'pay_fake1',
            amount: 20_000,
            currency: 'INR',
            receipt: 'slotTaken:12',
            status: 'processed',
          },
        },
        payment: { entity: payment },
      }),
      'evt_4',
    )
    expect(parsed.ok && parsed.value).toMatchObject({
      type: 'refund.processed',
      gatewayRefundId: 'rfnd_fake1',
      gatewayPaymentId: 'pay_fake1',
      amountPaise: 20_000,
      refundReceipt: 'slotTaken:12',
    })
  })

  it('reads a paid payment link with the payment made on it', () => {
    const parsed = parseRazorpayEvent(
      body('payment_link.paid', {
        payment_link: {
          entity: { id: 'plink_fake1', amount: 50_000, currency: 'INR', status: 'paid' },
        },
        order: { entity: { id: 'order_fakelink', amount: 50_000, currency: 'INR' } },
        payment: { entity: { ...payment, order_id: 'order_fakelink' } },
      }),
      'evt_5',
    )
    expect(parsed.ok && parsed.value).toMatchObject({
      type: 'payment_link.paid',
      gatewayPaymentLinkId: 'plink_fake1',
      gatewayPaymentId: 'pay_fake1',
      gatewayOrderId: 'order_fakelink',
      amountPaise: 50_000,
    })
  })

  it('reads an expired or cancelled link by its id alone', () => {
    for (const type of ['payment_link.expired', 'payment_link.cancelled']) {
      const parsed = parseRazorpayEvent(
        body(type, {
          payment_link: {
            entity: { id: 'plink_fake2', amount: 50_000, currency: 'INR', status: 'expired' },
          },
        }),
        'evt_6',
      )
      expect(parsed.ok && parsed.value).toMatchObject({ type, gatewayPaymentLinkId: 'plink_fake2' })
    }
  })

  it('answers an event the platform does not take as unsupported', () => {
    expect(parseRazorpayEvent(body('subscription.charged', {}), 'evt_7')).toEqual({
      ok: false,
      error: { code: 'unsupported-event' },
    })
  })

  it('refuses a body that is not JSON, or lacks the entity its event needs', () => {
    expect(parseRazorpayEvent('{not json', 'evt_8')).toEqual({
      ok: false,
      error: { code: 'bad-body' },
    })
    expect(parseRazorpayEvent(body('payment.captured', {}), 'evt_9')).toEqual({
      ok: false,
      error: { code: 'bad-body' },
    })
    expect(
      parseRazorpayEvent(
        body('payment.captured', { payment: { entity: { ...payment, amount: 10.5 } } }),
        'evt_10',
      ),
    ).toEqual({ ok: false, error: { code: 'bad-body' } })
  })

  it('refuses a missing or overlong event id', () => {
    const good = body('payment.captured', { payment: { entity: payment } })
    expect(parseRazorpayEvent(good, '')).toEqual({ ok: false, error: { code: 'bad-event-id' } })
    expect(parseRazorpayEvent(good, 'e'.repeat(101))).toEqual({
      ok: false,
      error: { code: 'bad-event-id' },
    })
  })

  it('reads what the fake gateway sends, as Razorpay would send it', () => {
    const fake = new FakeGateway()
    const order = fake.orders.set('order_fake9', {
      orderId: 'order_fake9',
      amountPaise: 30_000,
      status: 'created',
    })
    expect(order.size).toBe(1)
    const sent = fake.pay('order_fake9')
    const parsed = parseRazorpayEvent(sent.rawBody, sent.eventId)
    expect(parsed.ok && parsed.value).toMatchObject({
      type: 'payment.captured',
      gatewayOrderId: 'order_fake9',
      amountPaise: 30_000,
      currency: 'INR',
    })
  })
})
