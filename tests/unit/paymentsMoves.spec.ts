// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { paymentMove, paymentStatusAfterRefund, refundMove } from '@/lib/payments/moves'
import { PAYMENT_STATUSES, REFUND_STATUSES } from '@/lib/payments/states'

// The payment's and the refund's state machines (docs/16 §3), as the payments module applies
// them: every move in the tables is allowed, every other move is refused with a typed error.

const payments = PAYMENT_STATUSES.map((status) => status.value)
const refunds = REFUND_STATUSES.map((status) => status.value)

describe('the payment’s moves', () => {
  it('lets a payment be captured from created, authorised or a failed first attempt', () => {
    for (const from of ['created', 'authorized', 'failed'] as const) {
      expect(paymentMove(from, 'captured')).toEqual({ ok: true, value: 'captured' })
    }
  })

  it('never moves a captured payment back, or to failed', () => {
    for (const to of ['created', 'authorized', 'failed', 'expired', 'cancelled'] as const) {
      expect(paymentMove('captured', to)).toEqual({
        ok: false,
        error: { code: 'bad-move', from: 'captured', to },
      })
    }
  })

  it('keeps refunded, expired and cancelled payments final', () => {
    for (const from of ['refunded', 'expired', 'cancelled'] as const) {
      for (const to of payments) expect(paymentMove(from, to).ok, `${from} → ${to}`).toBe(false)
    }
  })

  it('refuses standing still, so a repeated event is never a move', () => {
    for (const status of payments.filter((status) => status !== 'partRefunded')) {
      expect(paymentMove(status, status).ok, status).toBe(false)
    }
  })

  it('moves a refunded amount to part refunded or refunded, never past the amount', () => {
    expect(paymentStatusAfterRefund({ amountPaise: 1000, refundedPaise: 400 })).toBe('partRefunded')
    expect(paymentStatusAfterRefund({ amountPaise: 1000, refundedPaise: 1000 })).toBe('refunded')
    expect(() => paymentStatusAfterRefund({ amountPaise: 1000, refundedPaise: 1001 })).toThrow(
      RangeError,
    )
  })
})

describe('the refund’s moves', () => {
  it('follows request → approval → gateway → answer', () => {
    const path = [
      ['requested', 'awaitingApproval'],
      ['awaitingApproval', 'approved'],
      ['approved', 'processing'],
      ['processing', 'processed'],
    ] as const
    for (const [from, to] of path) expect(refundMove(from, to).ok, `${from} → ${to}`).toBe(true)
  })

  it('never skips the gateway or approval, and keeps processed and declined final', () => {
    for (const [from, to] of [
      ['requested', 'processed'],
      ['awaitingApproval', 'processing'],
      ['approved', 'processed'],
      ['declined', 'approved'],
      ['processed', 'failed'],
      ['processed', 'processing'],
    ] as const) {
      expect(refundMove(from, to)).toEqual({ ok: false, error: { code: 'bad-move', from, to } })
    }
    for (const to of refunds) {
      expect(refundMove('processed', to).ok).toBe(false)
      expect(refundMove('declined', to).ok).toBe(false)
    }
  })

  it('sends a failed refund again only through the gateway', () => {
    expect(refundMove('failed', 'processing').ok).toBe(true)
    expect(refundMove('failed', 'processed').ok).toBe(false)
  })
})
