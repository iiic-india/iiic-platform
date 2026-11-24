// @vitest-environment node
import { createHmac } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import { parseEnv } from '@/lib/env'
import { FakeGateway } from '@/lib/payments/fakeGateway'
import { gatewayFor } from '@/lib/payments/gatewayFor'
import { RazorpayGateway, toGatewayError, type RazorpayClient } from '@/lib/payments/razorpay'

vi.mock('server-only', () => ({}))

// The gateway (docs/16 §5): Razorpay through its SDK, with its answers read by Zod and its
// signatures checked by the SDK on the raw body; and the fake, which signs as Razorpay does.
// Keys and secrets here are fake and exist only in this test.

const KEYS = {
  keyId: 'rzp_test_fakekeyid0001',
  keySecret: 'fake-key-secret-for-tests-only',
  webhookSecret: 'fake-webhook-secret-for-tests-0001',
}

const hmac = (secret: string, text: string) =>
  createHmac('sha256', secret).update(text).digest('hex')

const BASE_ENV = {
  PAYLOAD_SECRET: 'x'.repeat(32),
  DATABASE_URL: 'postgres://localhost/fake',
}

function stubClient(overrides: Record<string, Record<string, unknown>> = {}): RazorpayClient {
  return {
    orders: { create: vi.fn(), fetchPayments: vi.fn(), ...overrides.orders },
    payments: { refund: vi.fn(), all: vi.fn(), ...overrides.payments },
    paymentLink: { create: vi.fn(), cancel: vi.fn(), ...overrides.paymentLink },
  } as unknown as RazorpayClient
}

describe('the webhook signature, on the raw body', () => {
  const gateway = new RazorpayGateway(KEYS, stubClient())
  const body = '{"event":"payment.captured","payload":{}}'

  it('accepts the signature Razorpay makes with the webhook secret', () => {
    expect(gateway.verifyWebhook(body, hmac(KEYS.webhookSecret, body))).toBe(true)
  })

  it('refuses a changed body, another secret, or a signature that is not one', () => {
    const signature = hmac(KEYS.webhookSecret, body)
    expect(gateway.verifyWebhook(`${body} `, signature)).toBe(false)
    expect(gateway.verifyWebhook(body, hmac('another-secret', body))).toBe(false)
    expect(gateway.verifyWebhook(body, signature.toUpperCase())).toBe(false)
    expect(gateway.verifyWebhook(body, '')).toBe(false)
    expect(gateway.verifyWebhook(body, 'not-a-signature')).toBe(false)
  })

  it('checks the fake’s webhooks the same way', () => {
    const fake = new FakeGateway('fake-secret-for-this-test-only')
    fake.orders.set('order_fake1', { orderId: 'order_fake1', amountPaise: 100, status: 'created' })
    const sent = fake.pay('order_fake1')
    expect(fake.verifyWebhook(sent.rawBody, sent.signature)).toBe(true)
    expect(fake.verifyWebhook(sent.rawBody.replace('100', '999'), sent.signature)).toBe(false)
  })
})

describe('the checkout signature (a hint for the page, never proof)', () => {
  const gateway = new RazorpayGateway(KEYS, stubClient())

  it('is made over order id and payment id with the key secret', () => {
    const signature = hmac(KEYS.keySecret, 'order_fake1|pay_fake1')
    expect(
      gateway.verifyCheckout({ orderId: 'order_fake1', paymentId: 'pay_fake1', signature }),
    ).toBe(true)
    expect(
      gateway.verifyCheckout({ orderId: 'order_fake1', paymentId: 'pay_fake2', signature }),
    ).toBe(false)
  })
})

describe('the gateway’s answers', () => {
  it('sends the order’s amount in paise, in rupees’ currency, with our receipt', async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ id: 'order_fake1', amount: 50_000, status: 'created' })
    const gateway = new RazorpayGateway(KEYS, stubClient({ orders: { create } }))
    const result = await gateway.createOrder({
      amountPaise: 50_000,
      receipt: 'booking:1:checkout',
      notes: { receipt: 'booking:1:checkout' },
    })
    expect(result).toEqual({
      ok: true,
      value: { orderId: 'order_fake1', amountPaise: 50_000, status: 'created' },
    })
    expect(create).toHaveBeenCalledWith({
      amount: 50_000,
      currency: 'INR',
      receipt: 'booking:1:checkout',
      notes: { receipt: 'booking:1:checkout' },
    })
  })

  it('trusts no answer it cannot read', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'order_fake1', amount: '50000' })
    const gateway = new RazorpayGateway(KEYS, stubClient({ orders: { create } }))
    expect(await gateway.createOrder({ amountPaise: 1, receipt: 'r', notes: {} })).toEqual({
      ok: false,
      error: { code: 'unavailable' },
    })
  })

  it('tells a refusal from an outage, and keeps the gateway’s message out', () => {
    expect(
      toGatewayError({
        statusCode: 400,
        error: { code: 'BAD_REQUEST_ERROR', description: 'about the payer' },
      }),
    ).toEqual({ code: 'refused', gatewayCode: 'BAD_REQUEST_ERROR' })
    expect(toGatewayError({ statusCode: 404, error: {} })).toEqual({ code: 'not-found' })
    expect(toGatewayError({ statusCode: 502 })).toEqual({ code: 'unavailable' })
    expect(toGatewayError(new TypeError('socket hang up'))).toEqual({ code: 'unavailable' })
  })

  it('makes a payment link the gateway does not send itself, with no contact details', async () => {
    const create = vi.fn().mockResolvedValue({
      id: 'plink_fake1',
      short_url: 'https://example.invalid/pay/1',
      status: 'created',
    })
    const gateway = new RazorpayGateway(KEYS, stubClient({ paymentLink: { create } }))
    const expiresAt = new Date('2099-01-01T00:00:00Z')
    await gateway.createPaymentLink({
      amountPaise: 50_000,
      receipt: 'booking:1:link:1',
      description: 'Booking FAKE-REF',
      expiresAt,
      notify: false,
    })
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 50_000,
        currency: 'INR',
        reference_id: 'booking:1:link:1',
        expire_by: Math.floor(expiresAt.getTime() / 1000),
        notify: { sms: false, email: false },
        customer: {},
        reminder_enable: false,
      }),
    )
  })

  it('refunds to the original payment with our key as the receipt', async () => {
    const refund = vi.fn().mockResolvedValue({
      id: 'rfnd_fake1',
      payment_id: 'pay_fake1',
      amount: 1000,
      status: 'pending',
    })
    const gateway = new RazorpayGateway(KEYS, stubClient({ payments: { refund } }))
    const result = await gateway.refund({
      paymentId: 'pay_fake1',
      amountPaise: 1000,
      receipt: 'k1',
    })
    expect(result.ok && result.value.status).toBe('pending')
    expect(refund).toHaveBeenCalledWith('pay_fake1', {
      amount: 1000,
      speed: 'normal',
      receipt: 'k1',
    })
  })

  it('reads every page of a day’s payments', async () => {
    const item = (n: number) => ({
      id: `pay_fake${n}`,
      order_id: null,
      amount: 100,
      status: 'captured',
      method: 'upi',
      error_code: null,
      created_at: 4_000_000_000,
      email: 'never@example.invalid',
    })
    const all = vi
      .fn()
      .mockResolvedValueOnce({ items: Array.from({ length: 100 }, (_, n) => item(n)) })
      .mockResolvedValueOnce({ items: [item(100)] })
    const gateway = new RazorpayGateway(KEYS, stubClient({ payments: { all } }))
    const result = await gateway.listPayments({
      from: new Date('2099-01-01T00:00:00Z'),
      to: new Date('2099-01-02T00:00:00Z'),
    })
    expect(result.ok && result.value).toHaveLength(101)
    expect(all).toHaveBeenNthCalledWith(2, expect.objectContaining({ count: 100, skip: 100 }))
    expect(JSON.stringify(result)).not.toContain('example.invalid')
  })
})

describe('gatewayFor', () => {
  it('turns payments off, and says so, when the Razorpay keys are not set', () => {
    expect(gatewayFor(parseEnv(BASE_ENV))).toEqual({
      ok: false,
      error: { code: 'not-configured' },
    })
  })

  it('uses Razorpay in test mode with test keys', () => {
    const result = gatewayFor(
      parseEnv({
        ...BASE_ENV,
        RAZORPAY_KEY_ID: KEYS.keyId,
        RAZORPAY_KEY_SECRET: KEYS.keySecret,
        RAZORPAY_WEBHOOK_SECRET: KEYS.webhookSecret,
      }),
    )
    expect(result.ok && result.value.name).toBe('razorpay')
    expect(result.ok && result.value.testMode).toBe(true)
    expect(result.ok && result.value.publicKeyId).toBe(KEYS.keyId)
  })

  it('takes no payment on a preview, which shares production’s database', () => {
    const keys = {
      ...BASE_ENV,
      RAZORPAY_KEY_ID: KEYS.keyId,
      RAZORPAY_KEY_SECRET: KEYS.keySecret,
      RAZORPAY_WEBHOOK_SECRET: KEYS.webhookSecret,
    }
    for (const VERCEL_ENV of ['preview', 'development']) {
      expect(gatewayFor(parseEnv({ ...keys, VERCEL_ENV }))).toEqual({
        ok: false,
        error: { code: 'not-configured' },
      })
    }
    const production = gatewayFor(parseEnv({ ...keys, VERCEL_ENV: 'production' }))
    expect(production.ok && production.value.name).toBe('razorpay')
  })

  it('uses one fake per process when asked, and only then', () => {
    const one = gatewayFor(parseEnv({ ...BASE_ENV, PAYMENT_GATEWAY: 'fake' }))
    const two = gatewayFor(parseEnv({ ...BASE_ENV, PAYMENT_GATEWAY: 'fake' }))
    expect(one.ok && one.value.name).toBe('fake')
    expect(one.ok && two.ok && one.value === two.value).toBe(true)
  })
})
