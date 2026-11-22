// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  canClientCancel,
  canClientReschedule,
  canMove,
  refundForCancellation,
  resolveRules,
  rulesFromService,
  rulesFromSettings,
} from '@/lib/booking/policies'
import type { RefundStep } from '@/lib/booking/types'

// The booking rules and the reschedule and cancellation policies (D-16; docs/16 §6), pure. Every
// number here is a fake test value: IIIC's rules live in the admin, and D-16 is still open, so
// with no window or no steps the client is sent to IIIC and nothing is refunded automatically.

const HOUR = 3_600_000
const START = new Date('2026-12-07T04:30:00.000Z')
const before = (hours: number) => new Date(START.getTime() - hours * HOUR)

describe('the rules a booking runs by', () => {
  const defaults = { noticeHours: 12, horizonDays: 14, holdMinutes: 10, bufferMinutes: 5 }

  it('takes the service’s own rule where it sets one, else the default in Settings', () => {
    const result = resolveRules({ noticeHours: 2, bufferMinutes: 0 }, defaults)
    expect(result).toEqual({
      ok: true,
      value: {
        noticeHours: 2,
        horizonDays: 14,
        holdMinutes: 10,
        bufferMinutes: 0,
        rescheduleWindowHours: null,
        refundSteps: [],
      },
    })
  })

  it('names every rule neither sets, and offers nothing then', () => {
    const result = resolveRules({ noticeHours: 2 }, { horizonDays: 14 })
    expect(result).toEqual({
      ok: false,
      error: { code: 'rule-missing', rules: ['bufferMinutes', 'holdMinutes'] },
    })
    expect(resolveRules(null, undefined)).toEqual({
      ok: false,
      error: {
        code: 'rule-missing',
        rules: ['noticeHours', 'horizonDays', 'bufferMinutes', 'holdMinutes'],
      },
    })
  })

  it('reads an empty, negative or fractional value as not set', () => {
    const result = resolveRules(
      { noticeHours: null, horizonDays: -1, bufferMinutes: 2.5, holdMinutes: '10' },
      defaults,
    )
    expect(result.ok && result.value).toMatchObject(defaults)
  })

  it('keeps the reschedule window unset until one is set (D-16)', () => {
    expect(resolveRules({}, defaults)).toMatchObject({ value: { rescheduleWindowHours: null } })
    expect(resolveRules({}, { ...defaults, rescheduleWindowHours: 24 })).toMatchObject({
      value: { rescheduleWindowHours: 24 },
    })
    expect(
      resolveRules({ rescheduleWindowHours: 0 }, { ...defaults, rescheduleWindowHours: 24 }),
    ).toMatchObject({ value: { rescheduleWindowHours: 0 } })
  })

  it('orders refund steps most notice first and drops a step that is not one', () => {
    const result = resolveRules(
      {
        refundSteps: [
          { hoursBefore: 0, refundPercent: 0 },
          { hoursBefore: 48, refundPercent: 100 },
          { hoursBefore: 24, refundPercent: 50 },
          { hoursBefore: 12, refundPercent: 150 },
          { hoursBefore: -1, refundPercent: 10 },
          null,
        ],
      },
      defaults,
    )
    expect(result.ok && result.value.refundSteps).toEqual([
      { hoursBefore: 48, refundPercent: 100 },
      { hoursBefore: 24, refundPercent: 50 },
      { hoursBefore: 0, refundPercent: 0 },
    ])
  })

  it('reads a service’s booking rules and the settings’ defaults as the admin stores them', () => {
    expect(
      rulesFromService({
        noticeHours: 1,
        horizonDays: null,
        refunds: [{ hoursBefore: 24, refundPercent: 50, id: 'row' }],
      }),
    ).toEqual({
      noticeHours: 1,
      horizonDays: null,
      refundSteps: [{ hoursBefore: 24, refundPercent: 50 }],
    })
    expect(rulesFromService(undefined)).toEqual({})
    expect(rulesFromSettings({ booking: { noticeHours: 3, holdMinutes: 7 } })).toEqual({
      noticeHours: 3,
      holdMinutes: 7,
    })
    expect(rulesFromSettings(null)).toEqual({})
  })
})

describe('whether a client may reschedule (F4, D-16)', () => {
  const base = { startsAt: START, rescheduleWindowHours: 24, status: 'confirmed' }

  it('allows it up to the window’s hours before the start, the boundary included', () => {
    expect(canClientReschedule({ ...base, now: before(48) })).toEqual({ allowed: true })
    expect(canClientReschedule({ ...base, now: before(24) })).toEqual({ allowed: true })
  })

  it('refuses it inside the window, once started, or when not confirmed', () => {
    expect(canClientReschedule({ ...base, now: before(23.9) })).toEqual({
      allowed: false,
      reason: 'outside-window',
    })
    expect(canClientReschedule({ ...base, now: START })).toEqual({
      allowed: false,
      reason: 'started',
    })
    expect(canClientReschedule({ ...base, now: before(48), status: 'held' })).toEqual({
      allowed: false,
      reason: 'not-active',
    })
  })

  it('sends the client to IIIC while no window is set', () => {
    expect(canClientReschedule({ ...base, now: before(500), rescheduleWindowHours: null })).toEqual(
      { allowed: false, reason: 'no-policy' },
    )
  })

  it('reads a window of zero as “any time before the start”', () => {
    expect(canClientReschedule({ ...base, now: before(0.01), rescheduleWindowHours: 0 })).toEqual({
      allowed: true,
    })
  })
})

describe('whether a client may cancel (F4, D-16)', () => {
  const steps: RefundStep[] = [{ hoursBefore: 24, refundPercent: 50 }]

  it('lets a client cancel what they have not paid for, before it starts', () => {
    for (const status of ['confirmed', 'requested', 'held', 'pendingPayment']) {
      expect(
        canClientCancel({ now: before(1), startsAt: START, status, paidPaise: 0, steps: [] }),
        status,
      ).toEqual({ allowed: true })
    }
    // A time request has no start yet.
    expect(
      canClientCancel({ now: before(1), startsAt: null, status: 'requested', paidPaise: 0, steps }),
    ).toEqual({ allowed: true })
  })

  it('sends a client who has paid to IIIC while the refund rule is not set', () => {
    expect(
      canClientCancel({
        now: before(48),
        startsAt: START,
        status: 'confirmed',
        paidPaise: 100,
        steps: [],
      }),
    ).toEqual({ allowed: false, reason: 'no-policy' })
    expect(
      canClientCancel({
        now: before(48),
        startsAt: START,
        status: 'confirmed',
        paidPaise: 100,
        steps,
      }),
    ).toEqual({ allowed: true })
  })

  it('refuses once started, and for a booking already over', () => {
    expect(
      canClientCancel({ now: START, startsAt: START, status: 'confirmed', paidPaise: 0, steps }),
    ).toEqual({ allowed: false, reason: 'started' })
    for (const status of ['completed', 'cancelledByClient', 'rescheduled', 'expired']) {
      expect(
        canClientCancel({ now: before(48), startsAt: START, status, paidPaise: 0, steps }),
        status,
      ).toEqual({ allowed: false, reason: 'not-active' })
    }
  })
})

describe('the refund a cancellation earns (D-16)', () => {
  const steps: RefundStep[] = [
    { hoursBefore: 48, refundPercent: 100 },
    { hoursBefore: 24, refundPercent: 50 },
    { hoursBefore: 0, refundPercent: 0 },
  ]
  const paidPaise = 150_001

  it('takes the step with the most notice the cancellation meets', () => {
    const at = (hours: number) =>
      refundForCancellation({ now: before(hours), startsAt: START, paidPaise, steps, by: 'client' })
    expect(at(72)).toEqual({ refundPaise: 150_001, step: steps[0] })
    expect(at(48)).toEqual({ refundPaise: 150_001, step: steps[0] })
    expect(at(30)).toEqual({ refundPaise: 75_001, step: steps[1] })
    expect(at(1)).toEqual({ refundPaise: 0, step: steps[2] })
  })

  it('rounds a share half up to the paise and never past what was paid', () => {
    const half = [{ hoursBefore: 0, refundPercent: 50 }]
    const refund = (paid: number) =>
      refundForCancellation({
        now: before(1),
        startsAt: START,
        paidPaise: paid,
        steps: half,
        by: 'client',
      }).refundPaise
    expect(refund(1)).toBe(1)
    expect(refund(3)).toBe(2)
    expect(refund(4)).toBe(2)
    const third = [{ hoursBefore: 0, refundPercent: 33 }]
    expect(
      refundForCancellation({
        now: before(1),
        startsAt: START,
        paidPaise: 100,
        steps: third,
        by: 'client',
      }),
    ).toEqual({ refundPaise: 33, step: third[0] })
  })

  it('refunds nothing with no step met, no step set, after the start or nothing paid', () => {
    const late = [{ hoursBefore: 24, refundPercent: 100 }]
    expect(
      refundForCancellation({
        now: before(2),
        startsAt: START,
        paidPaise,
        steps: late,
        by: 'client',
      }),
    ).toEqual({ refundPaise: 0, step: null })
    expect(
      refundForCancellation({
        now: before(99),
        startsAt: START,
        paidPaise,
        steps: [],
        by: 'client',
      }),
    ).toEqual({ refundPaise: 0, step: null })
    expect(
      refundForCancellation({ now: START, startsAt: START, paidPaise, steps, by: 'client' }),
    ).toEqual({ refundPaise: 0, step: null })
    expect(
      refundForCancellation({
        now: before(99),
        startsAt: START,
        paidPaise: 0,
        steps,
        by: 'client',
      }),
    ).toEqual({ refundPaise: 0, step: null })
  })

  it('refunds in full when IIIC cancels, whatever the steps (D-16’s symmetry)', () => {
    for (const hours of [99, 1, 0, -2]) {
      expect(
        refundForCancellation({
          now: before(hours),
          startsAt: START,
          paidPaise,
          steps: [],
          by: 'iiic',
        }),
      ).toEqual({ refundPaise: paidPaise, step: null })
    }
  })

  it('refuses money that is not whole paise', () => {
    expect(() =>
      refundForCancellation({
        now: before(99),
        startsAt: START,
        paidPaise: 10.5,
        steps,
        by: 'client',
      }),
    ).toThrow(RangeError)
  })
})

describe('the moves a booking may make (docs/16 §3)', () => {
  it('follows the table of moves and nothing else', () => {
    expect(canMove('held', 'pendingPayment')).toBe(true)
    expect(canMove('pendingPayment', 'confirmed')).toBe(true)
    expect(canMove('expired', 'confirmed')).toBe(true)
    expect(canMove('requested', 'confirmed')).toBe(true)
    expect(canMove('held', 'confirmed')).toBe(false)
    expect(canMove('rescheduled', 'confirmed')).toBe(false)
    expect(canMove('confirmed', 'held')).toBe(false)
    expect(canMove('unknown', 'confirmed')).toBe(false)
  })
})
