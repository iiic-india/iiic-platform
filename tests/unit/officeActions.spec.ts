import type { PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'

import { formatPaise, officeErrorMessage } from '@/lib/office/copy'
import {
  bookableTimesHandler,
  cancelHandler,
  cancelPreviewHandler,
  confirmTimeHandler,
  decideRefundHandler,
  paymentLinkHandler,
  rescheduleHandler,
  resendRefundHandler,
  statusFor,
} from '@/lib/office/handlers'
import { CancelBody, ConfirmTimeBody, parseInput, PaymentLinkBody, PreviewQuery, When } from '@/lib/office/inputs'
import { cancellationRefundKey, splitRefund } from '@/lib/office/refundPlan'
import { refusalFor } from '@/lib/office/who'

// The office's money and calendar actions (docs/16 §12, E): who may act, checked before anything
// is read (CLAUDE.md #6); what the endpoints accept (India time in, UTC stored, CLAUDE.md #8); and
// how a cancellation's refund is spread over a booking's payments (CLAUDE.md #5). The actions
// themselves, against Postgres, are in tests/int/officeActions.int.spec.ts.

const staff = (roles: string[], strategy = 'totp', extra: Record<string, unknown> = {}) => ({
  id: 7,
  collection: 'users',
  roles,
  active: true,
  _strategy: strategy,
  ...extra,
})

describe('who may act (refusalFor)', () => {
  it('asks for a staff sign-in first', () => {
    expect(refusalFor(null, 'office')).toEqual({ status: 401, code: 'sign-in' })
    expect(refusalFor(undefined, 'owner')).toEqual({ status: 401, code: 'sign-in' })
    // A client's session from another collection is no staff sign-in.
    expect(refusalFor({ ...staff(['owner']), collection: 'people' }, 'office')).toEqual({
      status: 401,
      code: 'sign-in',
    })
  })

  it('asks for the two-factor code before the role', () => {
    expect(refusalFor(staff(['owner'], 'local-jwt'), 'owner')).toEqual({
      status: 403,
      code: 'enter-code',
    })
    expect(refusalFor(staff(['operator'], 'api-key'), 'office')?.code).toBe('enter-code')
  })

  it('refuses a deactivated account whatever its role', () => {
    expect(refusalFor(staff(['owner'], 'totp', { active: false }), 'owner')?.code).toBe(
      'not-allowed',
    )
  })

  it('lets the office (owner, operator) act on bookings, and no other role', () => {
    expect(refusalFor(staff(['owner']), 'office')).toBeNull()
    expect(refusalFor(staff(['operator']), 'office')).toBeNull()
    for (const role of ['practitioner', 'editor', 'finance']) {
      expect(refusalFor(staff([role]), 'office')).toEqual({ status: 403, code: 'not-allowed' })
    }
  })

  it('lets only an owner decide a refund', () => {
    expect(refusalFor(staff(['owner']), 'owner')).toBeNull()
    for (const role of ['operator', 'practitioner', 'editor', 'finance']) {
      expect(refusalFor(staff([role]), 'owner')?.code).toBe('not-allowed')
    }
  })

  it('lets the office and practitioners see working hours, and no other role', () => {
    for (const role of ['owner', 'operator', 'practitioner']) {
      expect(refusalFor(staff([role]), 'hours')).toBeNull()
    }
    for (const role of ['editor', 'finance']) {
      expect(refusalFor(staff([role]), 'hours')?.code).toBe('not-allowed')
    }
  })
})

/** A request as Payload hands an endpoint one: only what the refusal looks at. */
const request = (user: unknown, id: unknown = '12') =>
  ({
    user,
    routeParams: { id },
    searchParams: new URLSearchParams(),
    json: async () => ({}),
  }) as unknown as PayloadRequest

const ENDPOINTS = [
  ['GET bookings/:id/cancel-preview', cancelPreviewHandler, 'office'],
  ['POST bookings/:id/cancel', cancelHandler, 'office'],
  ['POST bookings/:id/reschedule', rescheduleHandler, 'office'],
  ['POST bookings/:id/confirm-time', confirmTimeHandler, 'office'],
  ['POST bookings/:id/payment-link', paymentLinkHandler, 'office'],
  ['POST refunds/:id/decide', decideRefundHandler, 'owner'],
  ['POST refunds/:id/send', resendRefundHandler, 'office'],
  ['GET availability-rules/bookable-times', bookableTimesHandler, 'hours'],
] as const

describe('the endpoints check the user first (CLAUDE.md #6)', () => {
  it.each(ENDPOINTS)('%s refuses an anonymous request with 401', async (_, handler) => {
    const response = await handler(request(null))
    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toMatchObject({ code: 'sign-in' })
  })

  it.each(ENDPOINTS)('%s refuses a session without the code with 403', async (_, handler) => {
    const response = await handler(request(staff(['owner'], 'local-jwt')))
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'enter-code' })
  })

  it.each(ENDPOINTS)('%s refuses a role it does not serve with 403', async (_, handler, need) => {
    const role = need === 'owner' ? 'operator' : need === 'office' ? 'practitioner' : 'finance'
    const response = await handler(request(staff([role])))
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'not-allowed' })
  })

  it('answers 404 for an id that is not a record’s, before anything is read', async () => {
    for (const [, handler, need] of ENDPOINTS) {
      if (need === 'hours') continue
      const response = await handler(request(staff(['owner']), 'not-an-id'))
      expect(response.status).toBe(404)
    }
  })

  it('maps each answer to its status', () => {
    expect(statusFor('invalid-input')).toBe(400)
    expect(statusFor('needs-owner')).toBe(403)
    expect(statusFor('not-found')).toBe(404)
    expect(statusFor('slot-taken')).toBe(409)
    expect(statusFor('refund-changed')).toBe(409)
    expect(statusFor('bad-move')).toBe(409)
    expect(statusFor('unavailable')).toBe(502)
    expect(statusFor('not-configured')).toBe(503)
  })
})

describe('what the endpoints accept', () => {
  it('reads a datetime-local value as India time and stores the instant', () => {
    const parsed = When.parse('2099-04-06T10:30')
    expect(parsed.toISOString()).toBe('2099-04-06T05:00:00.000Z')
    expect(When.parse('2099-04-06T05:00:00Z').toISOString()).toBe('2099-04-06T05:00:00.000Z')
    expect(When.parse('2099-04-06T10:30:00+05:30').toISOString()).toBe('2099-04-06T05:00:00.000Z')
    for (const bad of ['2099-02-30T10:00', '2099-04-06T24:00', '10:30', 'tomorrow', '']) {
      expect(When.safeParse(bad).success).toBe(false)
    }
  })

  it('takes a cancellation with its reason and the refunds the page showed', () => {
    const parsed = parseInput(CancelBody, {
      by: 'iiic',
      reason: '  The practitioner is unwell  ',
      shownClientPaise: '0',
      shownIiicPaise: '50000',
    })
    expect(parsed).toEqual({
      ok: true,
      value: {
        by: 'iiic',
        reason: 'The practitioner is unwell',
        shownClientPaise: 0,
        shownIiicPaise: 50000,
      },
    })
    const missing = parseInput(CancelBody, { by: 'someone', reason: ' ', shownClientPaise: '-1' })
    expect(missing.ok).toBe(false)
    if (missing.ok) return
    expect(missing.error.fields).toEqual(
      expect.arrayContaining(['by', 'reason', 'shownClientPaise', 'shownIiicPaise']),
    )
  })

  it('treats an empty optional field as no answer', () => {
    expect(parseInput(PaymentLinkBody, { expiresAt: '' })).toEqual({ ok: true, value: {} })
    const confirm = parseInput(ConfirmTimeBody, { startsAt: '2099-04-06T10:00', practitionerId: '' })
    expect(confirm.ok && confirm.value.practitionerId).toBeUndefined()
    const chosen = parseInput(ConfirmTimeBody, { startsAt: '2099-04-06T10:00', practitionerId: '3' })
    expect(chosen.ok && chosen.value.practitionerId).toBe(3)
  })

  it('reads the preview’s option as a service and its option row', () => {
    expect(parseInput(PreviewQuery, { option: '4:abc_12-x', practitionerId: '9' })).toEqual({
      ok: true,
      value: { option: { serviceId: 4, serviceOption: 'abc_12-x' }, practitionerId: 9 },
    })
    expect(parseInput(PreviewQuery, { option: '4' }).ok).toBe(false)
    expect(parseInput(PreviewQuery, { option: 'x:1' }).ok).toBe(false)
  })
})

describe('a cancellation’s refund over the booking’s payments (splitRefund)', () => {
  it('takes the refund from the latest payment first, never more than each can give', () => {
    expect(
      splitRefund(70_000, [
        { paymentId: 2, refundablePaise: 50_000 },
        { paymentId: 1, refundablePaise: 50_000 },
      ]),
    ).toEqual({
      ok: true,
      value: [
        { paymentId: 2, amountPaise: 50_000 },
        { paymentId: 1, amountPaise: 20_000 },
      ],
    })
  })

  it('skips a payment with nothing left, and asks for nothing when nothing is due', () => {
    expect(
      splitRefund(10_000, [
        { paymentId: 2, refundablePaise: 0 },
        { paymentId: 1, refundablePaise: 50_000 },
      ]),
    ).toEqual({ ok: true, value: [{ paymentId: 1, amountPaise: 10_000 }] })
    expect(splitRefund(0, [{ paymentId: 1, refundablePaise: 50_000 }])).toEqual({
      ok: true,
      value: [],
    })
  })

  it('refuses more than the payments can give back', () => {
    expect(splitRefund(60_001, [{ paymentId: 1, refundablePaise: 60_000 }])).toEqual({
      ok: false,
      error: { code: 'over-refund', refundablePaise: 60_000 },
    })
    expect(() => splitRefund(1.5, [])).toThrow(RangeError)
    expect(() => splitRefund(-1, [])).toThrow(RangeError)
  })

  it('keys each refund by its booking and payment, inside the gateway’s receipt limit', () => {
    const key = cancellationRefundKey(123_456_789, 987_654_321)
    expect(key).toBe('cancel:123456789:987654321')
    expect(key.length).toBeLessThanOrEqual(40)
  })
})

describe('the words', () => {
  it('writes money as VOICE.md does, with paise only when there are some', () => {
    expect(formatPaise(1_250_000)).toBe('₹12,500')
    expect(formatPaise(12_390_000)).toBe('₹1,23,900')
    expect(formatPaise(150_050)).toBe('₹1,500.50')
    expect(formatPaise(0)).toBe('₹0')
  })

  it('explains each refusal, the reason behind a booking’s no included', () => {
    expect(officeErrorMessage({ code: 'not-allowed', reason: 'started' })).toMatch(/started/)
    expect(officeErrorMessage({ code: 'refused', gatewayCode: 'EXPIRY_TOO_SOON' })).toMatch(
      /16 minutes/,
    )
    expect(officeErrorMessage({ code: 'invalid-input', fields: ['reason'] })).toMatch(/reason/)
    expect(officeErrorMessage({ code: 'something-new' })).toMatch(/Reload the page/)
  })
})
