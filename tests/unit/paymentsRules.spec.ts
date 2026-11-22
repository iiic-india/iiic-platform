// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import {
  gatewayEventRules,
  paymentRules,
  priceHistoryRules,
  refundRules,
} from '@/lib/payments/hooks'
import { findingFor, istDayWindow } from '@/lib/payments/reconcile'
import {
  REFUND_KEY,
  refundableState,
  refundAmountAllowed,
  staffRefundKey,
  statusOnRequest,
} from '@/lib/payments/refundRules'
import type { GatewayEvent, Payment, PriceHistory, Refund } from '@/payload-types'

vi.mock('server-only', () => ({}))

// The refund approval threshold (docs/05, Money; docs/16 §5), the collections' own checks on
// the payments records, and B11's findings. Amounts are fake test values; IIIC's threshold is
// theirs to set in Settings and is empty until they do.

describe('the refund approval threshold', () => {
  it('approves the office’s refund at once only at or below a threshold that is set', () => {
    expect(statusOnRequest({ by: 'staff', amountPaise: 10_000, thresholdPaise: 10_000 })).toBe(
      'approved',
    )
    expect(statusOnRequest({ by: 'staff', amountPaise: 10_001, thresholdPaise: 10_000 })).toBe(
      'awaitingApproval',
    )
  })

  it('sends every refund to an owner while no threshold is set, even the smallest', () => {
    expect(statusOnRequest({ by: 'staff', amountPaise: 100, thresholdPaise: null })).toBe(
      'awaitingApproval',
    )
  })

  it('approves the platform’s own refund for a lost slot (B10) whatever the threshold', () => {
    expect(statusOnRequest({ by: 'platform', amountPaise: 10_000_000, thresholdPaise: null })).toBe(
      'approved',
    )
  })

  it('refunds only captured money not yet all refunded, in whole paise from ₹1', () => {
    expect(refundableState({ status: 'captured' }).ok).toBe(true)
    expect(refundableState({ status: 'partRefunded' }).ok).toBe(true)
    for (const status of ['created', 'failed', 'refunded', 'expired'] as const) {
      expect(refundableState({ status }).ok, status).toBe(false)
    }
    expect(refundAmountAllowed(100)).toBe(true)
    expect(refundAmountAllowed(99)).toBe(false)
    expect(refundAmountAllowed(150.5)).toBe(false)
  })

  it('gives a hand-made refund a key short enough to be the gateway’s receipt', () => {
    const key = staffRefundKey()
    expect(key).toMatch(REFUND_KEY)
    expect(staffRefundKey()).not.toBe(key)
  })
})

const local = { payloadAPI: 'local' } as never
const hookArgs = <T>(data: Partial<T>, originalDoc: T, operation: 'create' | 'update' = 'update') =>
  ({ data, originalDoc, operation, req: local, collection: {} as never, context: {} }) as never

const payment = {
  id: 1,
  booking: 2,
  kind: 'checkout',
  gateway: 'razorpay',
  status: 'created',
  amountPaise: 50_000,
  currency: 'INR',
  refundedPaise: 0,
  receipt: 'booking:2:checkout',
  gatewayOrderId: 'order_fake1',
} as Payment

describe('the payments collection’s own checks', () => {
  it('lets a payment make the moves its state machine lists', () => {
    const data = { ...payment, status: 'captured' as const }
    expect(paymentRules(hookArgs<Payment>(data, payment))).toEqual(data)
  })

  it('refuses any other move, whoever writes', () => {
    const captured = { ...payment, status: 'captured' as const, gatewayPaymentId: 'pay_fake1' }
    expect(() =>
      paymentRules(hookArgs<Payment>({ ...captured, status: 'failed' }, captured)),
    ).toThrow(/cannot move from captured to failed/)
    expect(() =>
      paymentRules(hookArgs<Payment>({ ...payment, status: 'refunded' }, payment)),
    ).toThrow()
  })

  it('never changes the amount, the receipt, the order or a captured payment’s id', () => {
    expect(() => paymentRules(hookArgs<Payment>({ ...payment, amountPaise: 1 }, payment))).toThrow()
    expect(() =>
      paymentRules(hookArgs<Payment>({ ...payment, receipt: 'other' }, payment)),
    ).toThrow()
    expect(() =>
      paymentRules(hookArgs<Payment>({ ...payment, gatewayOrderId: 'order_other' }, payment)),
    ).toThrow()
    const captured = { ...payment, status: 'captured' as const, gatewayPaymentId: 'pay_fake1' }
    expect(() =>
      paymentRules(hookArgs<Payment>({ ...captured, gatewayPaymentId: 'pay_other' }, captured)),
    ).toThrow()
  })

  it('never refunds past the amount', () => {
    const captured = { ...payment, status: 'captured' as const }
    expect(() =>
      paymentRules(
        hookArgs<Payment>({ ...captured, status: 'refunded', refundedPaise: 50_001 }, captured),
      ),
    ).toThrow()
  })
})

const refund = {
  id: 3,
  payment: 1,
  booking: 2,
  status: 'processing',
  amountPaise: 20_000,
  reason: 'cancelledByIiic',
  idempotencyKey: 'cancel:2',
} as Refund

describe('the refunds collection’s own checks, for the server’s writes', () => {
  it('keeps to the refund’s state machine', async () => {
    await expect(
      refundRules(hookArgs<Refund>({ ...refund, status: 'processed' }, refund)),
    ).resolves.toMatchObject({ status: 'processed' })
    await expect(
      refundRules(hookArgs<Refund>({ ...refund, status: 'approved' }, refund)),
    ).rejects.toThrow(/cannot move from processing to approved/)
  })

  it('never changes the amount, the payment or the key', async () => {
    await expect(
      refundRules(hookArgs<Refund>({ ...refund, amountPaise: 1 }, refund)),
    ).rejects.toThrow()
    await expect(refundRules(hookArgs<Refund>({ ...refund, payment: 9 }, refund))).rejects.toThrow()
    await expect(
      refundRules(hookArgs<Refund>({ ...refund, idempotencyKey: 'other' }, refund)),
    ).rejects.toThrow()
  })
})

describe('gateway events and the price history', () => {
  it('keep what came as it came', () => {
    const event = {
      id: 1,
      gateway: 'razorpay',
      eventId: 'evt_fake',
      type: 'payment.captured',
      source: 'webhook',
      amountPaise: 100,
      receivedAt: '2099-01-01T00:00:00.000Z',
      outcome: 'processed',
    } as GatewayEvent
    expect(
      gatewayEventRules(hookArgs<GatewayEvent>({ ...event, outcome: 'flagged' }, event)),
    ).toBeTruthy()
    expect(() =>
      gatewayEventRules(hookArgs<GatewayEvent>({ ...event, amountPaise: 1 }, event)),
    ).toThrow()
  })

  it('let a price only end, once, after it started', () => {
    const row = {
      id: 1,
      service: 1,
      serviceOption: 'opt',
      pricePaise: 100,
      validFrom: '2099-01-01T00:00:00.000Z',
    } as PriceHistory
    expect(
      priceHistoryRules(
        hookArgs<PriceHistory>({ ...row, validTo: '2099-02-01T00:00:00.000Z' }, row),
      ),
    ).toBeTruthy()
    expect(() =>
      priceHistoryRules(
        hookArgs<PriceHistory>({ ...row, validTo: '2098-01-01T00:00:00.000Z' }, row),
      ),
    ).toThrow()
    expect(() =>
      priceHistoryRules(hookArgs<PriceHistory>({ ...row, pricePaise: 99 }, row)),
    ).toThrow()
    const ended = { ...row, validTo: '2099-02-01T00:00:00.000Z' }
    expect(() =>
      priceHistoryRules(
        hookArgs<PriceHistory>({ ...ended, validTo: '2099-03-01T00:00:00.000Z' }, ended),
      ),
    ).toThrow()
  })
})

describe('B11’s findings', () => {
  const found = {
    paymentId: 'pay_fake1',
    orderId: 'order_fake1',
    amountPaise: 50_000,
    status: 'captured' as const,
    method: 'upi',
    errorCode: null,
    createdAt: new Date(),
  }

  it('finds nothing wrong when the platform holds the capture and the booking is paid', () => {
    expect(findingFor(found, { status: 'captured', amountPaise: 50_000 }, 'paid')).toBeNull()
  })

  it('names each mismatch', () => {
    expect(findingFor(found, null, null)).toBe('unknown-capture')
    expect(findingFor(found, { status: 'created', amountPaise: 50_000 }, 'unpaid')).toBe(
      'missed-capture',
    )
    expect(findingFor(found, { status: 'captured', amountPaise: 40_000 }, 'paid')).toBe(
      'amount-mismatch',
    )
    expect(findingFor(found, { status: 'captured', amountPaise: 50_000 }, 'unpaid')).toBe(
      'booking-not-paid',
    )
    expect(
      findingFor(
        { ...found, status: 'refunded' },
        { status: 'captured', amountPaise: 50_000 },
        'paid',
      ),
    ).toBe('refund-outside-platform')
  })

  it('ignores payments that took no money', () => {
    expect(findingFor({ ...found, status: 'failed' }, null, null)).toBeNull()
  })

  it('reads a day in India from its midnight to the next', () => {
    expect(istDayWindow('2026-12-01')).toEqual({
      from: new Date('2026-11-30T18:30:00.000Z'),
      to: new Date('2026-12-01T18:30:00.000Z'),
    })
  })
})
