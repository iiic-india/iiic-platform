// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { templateSpec, type TemplateKey } from '@/emails/registry'
import {
  planChangeNotice,
  planConfirmation,
  planConsentReceipt,
  planFeedbackRequest,
  planNoShow,
  planPaymentLink,
  planPaymentLinkCancelled,
  planReceipt,
  planRefundNotice,
  planReminder24h,
  planReminderShort,
  planSlotLost,
  planTimeRequestAck,
} from '@/lib/automations/booking/plan'
import type { BookingSnapshot, Plan, PlanContext } from '@/lib/automations/booking/types'
import { automation } from '@/lib/automations/catalogue'
import { messageKey, type PlannedMessage } from '@/lib/messaging/operations'
import { decideSend } from '@/lib/messaging/policy'
import { DEFAULT_QUIET_HOURS } from '@/lib/settings/quietHours'

// The B-series planners (docs/19 §6, §11): right time in India, right channel, re-planning.
// Times are written in IST; India keeps no daylight saving.
const ist = (iso: string) => new Date(`${iso}+05:30`)

const context = (now: string): PlanContext => ({ now: ist(now), quiet: DEFAULT_QUIET_HOURS })

const booking = (over: Partial<BookingSnapshot> = {}): BookingSnapshot => ({
  id: 41,
  status: 'confirmed',
  paymentStatus: 'notRequired',
  startsAt: ist('2026-12-10T11:00:00'),
  confirmedAt: ist('2026-12-01T12:00:00'),
  format: 'office',
  counselling: false,
  recipientId: 7,
  prefersEmail: false,
  staffId: 3,
  ...over,
})

const keys = (plan: Plan) => plan.deliver.map((message) => messageKey(message))
const only = (plan: Plan): PlannedMessage => {
  expect(plan.deliver).toHaveLength(1)
  return plan.deliver[0] as PlannedMessage
}

describe('B2 · the confirmation', () => {
  it('goes at once by email and WhatsApp to whoever booked', () => {
    const plan = planConfirmation(booking(), context('2026-12-01T12:00:00'))
    expect(keys(plan)).toEqual(['B2:bookings:41:email', 'B2:bookings:41:whatsapp'])
    for (const message of plan.deliver) {
      expect(message.template).toBe('booking-confirmed')
      expect(message.recipient).toEqual({ kind: 'person', id: 7 })
      expect(message.sendAt).toEqual(ist('2026-12-01T12:00:00'))
      expect(message.sendBefore).toEqual(ist('2026-12-10T11:00:00'))
    }
  })

  it('goes by email only to someone who prefers email', () => {
    const plan = planConfirmation(booking({ prefersEmail: true }), context('2026-12-01T12:00:00'))
    expect(keys(plan)).toEqual(['B2:bookings:41:email'])
  })

  it('plans nothing for a booking that is not confirmed, or is gone', () => {
    expect(planConfirmation(booking({ status: 'held' }), context('2026-12-01T12:00:00'))).toEqual({
      cancel: [],
      deliver: [],
    })
    expect(planConfirmation(null, context('2026-12-01T12:00:00')).deliver).toEqual([])
  })

  it('is planned under the same keys twice, so the core records it once', () => {
    const first = planConfirmation(booking(), context('2026-12-01T12:00:00'))
    const again = planConfirmation(booking(), context('2026-12-01T12:05:00'))
    expect(keys(again)).toEqual(keys(first))
  })
})

describe('B3a · the counselling consent receipt', () => {
  it('goes by email with the confirmation, for counselling only', () => {
    const now = context('2026-12-01T12:00:00')
    expect(keys(planConsentReceipt(booking({ counselling: true }), now))).toEqual([
      'B3a:bookings:41:email',
    ])
    expect(planConsentReceipt(booking({ counselling: false }), now).deliver).toEqual([])
  })
})

describe('B5 · the reminder 24 hours before', () => {
  const confirmed = { name: 'booking.confirmed', bookingId: 41, cause: 'staff' } as const

  it('is due 24 hours before, on WhatsApp with email as its fallback', () => {
    const message = only(planReminder24h(confirmed, booking(), context('2026-12-01T12:00:00')))
    expect(message.template).toBe('reminder-24h')
    expect(message.channel).toBe('whatsapp')
    expect(message.fallback).toBe('email')
    expect(message.sendAt).toEqual(ist('2026-12-09T11:00:00'))
    expect(message.sendBefore).toEqual(ist('2026-12-10T11:00:00'))
  })

  it('goes by email to someone who prefers email', () => {
    const message = only(
      planReminder24h(confirmed, booking({ prefersEmail: true }), context('2026-12-01T12:00:00')),
    )
    expect(message.channel).toBe('email')
    expect(message.fallback).toBeUndefined()
  })

  it('is not planned for a booking made 20 hours ahead', () => {
    const late = booking({
      startsAt: ist('2026-12-02T08:00:00'),
      confirmedAt: ist('2026-12-01T12:00:00'),
    })
    expect(planReminder24h(confirmed, late, context('2026-12-01T12:00:00')).deliver).toEqual([])
  })

  it('due at 22:00 IST on WhatsApp, is planned for 08:00 the next morning', () => {
    const evening = booking({ startsAt: ist('2026-12-10T22:00:00') })
    const message = only(planReminder24h(confirmed, evening, context('2026-12-01T12:00:00')))
    expect(message.sendAt).toEqual(ist('2026-12-10T08:00:00'))
  })

  it('due at 22:00 IST by email, is not held for the quiet hours', () => {
    const evening = booking({ startsAt: ist('2026-12-10T22:00:00'), prefersEmail: true })
    const message = only(planReminder24h(confirmed, evening, context('2026-12-01T12:00:00')))
    expect(message.sendAt).toEqual(ist('2026-12-09T22:00:00'))
  })

  it('a reschedule cancels the old booking’s reminder and plans the new one’s', () => {
    const moved = booking({
      id: 52,
      startsAt: ist('2026-12-12T16:00:00'),
      confirmedAt: ist('2026-12-02T09:00:00'),
    })
    const plan = planReminder24h(
      { name: 'booking.rescheduled', bookingId: 52, fromBookingId: 41 },
      moved,
      context('2026-12-02T09:00:00'),
    )
    expect(plan.cancel).toEqual([{ subject: { collection: 'bookings', id: 41 }, automations: ['B5'] }])
    expect(keys(plan)).toEqual(['B5:bookings:52:whatsapp'])
    expect(only(plan).sendAt).toEqual(ist('2026-12-11T16:00:00'))
  })

  it('a cancellation cancels the reminder and plans nothing', () => {
    const plan = planReminder24h(
      { name: 'booking.cancelled', bookingId: 41, by: 'client' },
      booking({ status: 'cancelledByClient' }),
      context('2026-12-03T09:00:00'),
    )
    expect(plan).toEqual({
      cancel: [{ subject: { collection: 'bookings', id: 41 }, automations: ['B5'] }],
      deliver: [],
    })
  })
})

describe('B6 · the short reminder', () => {
  const confirmed = { name: 'booking.confirmed', bookingId: 41, cause: 'staff' } as const

  it('is due 2 hours before an office session, on WhatsApp only', () => {
    const message = only(planReminderShort(confirmed, booking(), context('2026-12-01T12:00:00')))
    expect(message.template).toBe('reminder-short')
    expect(message.channel).toBe('whatsapp')
    expect(message.fallback).toBeUndefined()
    expect(message.sendAt).toEqual(ist('2026-12-10T09:00:00'))
  })

  it('is due 30 minutes before an online session', () => {
    const online = booking({ format: 'online' })
    const message = only(planReminderShort(confirmed, online, context('2026-12-01T12:00:00')))
    expect(message.sendAt).toEqual(ist('2026-12-10T10:30:00'))
  })

  it('pushed by the quiet hours past the start, is recorded at its time and then dropped', () => {
    // An online session at 08:00: due 07:30, which the quiet hours' end would put at the start.
    const early = booking({ format: 'online', startsAt: ist('2026-12-10T08:00:00') })
    const message = only(planReminderShort(confirmed, early, context('2026-12-01T12:00:00')))
    expect(message.sendAt).toEqual(ist('2026-12-10T07:30:00'))
    const decision = decideSend({
      now: message.sendAt,
      channel: 'whatsapp',
      kind: templateSpec(message.template).kind,
      hasAddress: true,
      suppressed: false,
      under18: false,
      automationEnabled: true,
      channelConfigured: true,
      templateApproved: true,
      sendBefore: message.sendBefore,
    })
    expect(decision).toEqual({ action: 'skip', reason: 'quiet-hours-late' })
  })

  it('moved by the quiet hours to 08:00, still before the start, is planned for 08:00', () => {
    const early = booking({ format: 'online', startsAt: ist('2026-12-10T08:15:00') })
    const message = only(planReminderShort(confirmed, early, context('2026-12-01T12:00:00')))
    expect(message.sendAt).toEqual(ist('2026-12-10T08:00:00'))
  })

  it('is not sent to someone who prefers email', () => {
    const plan = planReminderShort(
      confirmed,
      booking({ prefersEmail: true }),
      context('2026-12-01T12:00:00'),
    )
    expect(plan.deliver).toEqual([])
  })

  it('a reschedule re-plans it at the new time', () => {
    const moved = booking({ id: 52, startsAt: ist('2026-12-12T16:00:00') })
    const plan = planReminderShort(
      { name: 'booking.rescheduled', bookingId: 52, fromBookingId: 41 },
      moved,
      context('2026-12-02T09:00:00'),
    )
    expect(plan.cancel).toEqual([{ subject: { collection: 'bookings', id: 41 }, automations: ['B6'] }])
    expect(only(plan).sendAt).toEqual(ist('2026-12-12T14:00:00'))
  })
})

describe('B7 · changes', () => {
  const now = context('2026-12-02T09:00:00')

  it('a reschedule tells the client on both channels and the practitioner by email', () => {
    const plan = planChangeNotice(
      { name: 'booking.rescheduled', bookingId: 52, fromBookingId: 41 },
      booking({ id: 52 }),
      now,
    )
    expect(keys(plan)).toEqual([
      'B7:bookings:52:rescheduled:email',
      'B7:bookings:52:rescheduled:whatsapp',
      'B7:bookings:52:staff-rescheduled:email',
    ])
    const staff = plan.deliver[2] as PlannedMessage
    expect(staff.template).toBe('booking-change-staff')
    expect(staff.recipient).toEqual({ kind: 'staff', id: 3 })
    expect(templateSpec(staff.template).sender).toBe('platform')
  })

  it('a cancellation has keys of its own, so a moved booking cancelled later gets both', () => {
    const plan = planChangeNotice(
      { name: 'booking.cancelled', bookingId: 52, by: 'iiic' },
      booking({ id: 52, status: 'cancelledByIiic' }),
      now,
    )
    expect(keys(plan)).toEqual([
      'B7:bookings:52:cancelled:email',
      'B7:bookings:52:cancelled:whatsapp',
      'B7:bookings:52:staff-cancelled:email',
    ])
  })

  it('tells no practitioner when none has a staff account', () => {
    const plan = planChangeNotice(
      { name: 'booking.cancelled', bookingId: 41, by: 'client' },
      booking({ status: 'cancelledByClient', staffId: null }),
      now,
    )
    expect(plan.deliver.map((message) => message.recipient.kind)).toEqual(['person', 'person'])
  })

  it('a processed refund is told by email about the refund', () => {
    const plan = planRefundNotice({ id: 9, status: 'processed' }, booking(), now)
    expect(keys(plan)).toEqual(['B7:refunds:9:email'])
    expect(planRefundNotice({ id: 9, status: 'processing' }, booking(), now).deliver).toEqual([])
  })
})

describe('B3 · the receipt', () => {
  it('goes by email once the invoice is issued', () => {
    const now = context('2026-12-01T12:00:00')
    expect(keys(planReceipt({ id: 5, status: 'issued' }, booking(), now))).toEqual([
      'B3:invoices:5:email',
    ])
    expect(planReceipt({ id: 5, status: 'pending' }, booking(), now).deliver).toEqual([])
  })
})

describe('B8 and B9 · after the session', () => {
  it('B8 asks for feedback by email 2 hours after the session is marked completed', () => {
    const message = only(
      planFeedbackRequest(booking({ status: 'completed' }), context('2026-12-10T12:30:00')),
    )
    expect(message.channel).toBe('email')
    expect(message.sendAt).toEqual(ist('2026-12-10T14:30:00'))
  })

  it('B9 writes by email, never WhatsApp, 1 hour after a no-show is marked', () => {
    const counselling = booking({ status: 'noShow', counselling: true })
    const message = only(planNoShow(counselling, context('2026-12-10T12:30:00')))
    expect(message.channel).toBe('email')
    expect(message.sendAt).toEqual(ist('2026-12-10T13:30:00'))
    expect(planNoShow(booking(), context('2026-12-10T12:30:00')).deliver).toEqual([])
  })
})

describe('B10 · the slot was lost', () => {
  it('tells the person and the practitioner by email, about the payment', () => {
    const plan = planSlotLost(
      { name: 'booking.slotLost', bookingId: 41, paymentId: 12 },
      booking({ status: 'expired' }),
      context('2026-12-01T12:00:00'),
    )
    expect(keys(plan)).toEqual(['B10:payments:12:email', 'B10:payments:12:staff:email'])
  })
})

describe('B12 · a time request', () => {
  it('is acknowledged at once by email and WhatsApp', () => {
    const plan = planTimeRequestAck(booking({ status: 'requested' }), context('2026-12-01T12:00:00'))
    expect(keys(plan)).toEqual(['B12:bookings:41:email', 'B12:bookings:41:whatsapp'])
  })
})

describe('B13 · a payment link', () => {
  const link = { id: 12, kind: 'paymentLink', status: 'created', amountPaise: 150000 }

  it('goes at once, with one email reminder 24 hours before the session', () => {
    const plan = planPaymentLink(
      link,
      booking({ paymentStatus: 'linkSent' }),
      [],
      context('2026-12-01T12:00:00'),
    )
    expect(keys(plan)).toEqual([
      'B13:payments:12:email',
      'B13:payments:12:whatsapp',
      'B13:payments:12:reminder:email',
    ])
    expect((plan.deliver[2] as PlannedMessage).sendAt).toEqual(ist('2026-12-09T11:00:00'))
    expect((plan.deliver[2] as PlannedMessage).template).toBe('payment-link-reminder')
  })

  it('has no reminder when the session is less than 24 hours away', () => {
    const plan = planPaymentLink(link, booking(), [], context('2026-12-09T12:00:00'))
    expect(keys(plan)).toEqual(['B13:payments:12:email', 'B13:payments:12:whatsapp'])
  })

  it('cancels the earlier links’ reminders, and is never sent for a free service', () => {
    const free = planPaymentLink(
      { ...link, amountPaise: 0 },
      booking(),
      [10, 11],
      context('2026-12-01T12:00:00'),
    )
    expect(free.deliver).toEqual([])
    expect(free.cancel).toEqual([
      { subject: { collection: 'payments', id: 10 }, automations: ['B13'] },
      { subject: { collection: 'payments', id: 11 }, automations: ['B13'] },
    ])
  })

  it('a cancelled booking cancels its payment links’ queued messages', () => {
    expect(planPaymentLinkCancelled([12])).toEqual({
      cancel: [{ subject: { collection: 'payments', id: 12 }, automations: ['B13'] }],
      deliver: [],
    })
  })
})

describe('every planned message', () => {
  const now = context('2026-12-01T12:00:00')
  const plans: Plan[] = [
    planConfirmation(booking({ counselling: true }), now),
    planConsentReceipt(booking({ counselling: true }), now),
    planReminder24h({ name: 'booking.confirmed', bookingId: 41, cause: 'staff' }, booking(), now),
    planReminderShort({ name: 'booking.confirmed', bookingId: 41, cause: 'staff' }, booking(), now),
    planChangeNotice({ name: 'booking.cancelled', bookingId: 41, by: 'client' }, booking({ status: 'cancelledByClient' }), now),
    planRefundNotice({ id: 9, status: 'processed' }, booking(), now),
    planReceipt({ id: 5, status: 'issued' }, booking(), now),
    planFeedbackRequest(booking({ status: 'completed' }), now),
    planNoShow(booking({ status: 'noShow' }), now),
    planSlotLost({ name: 'booking.slotLost', bookingId: 41, paymentId: 12 }, booking(), now),
    planTimeRequestAck(booking({ status: 'requested' }), now),
    planPaymentLink({ id: 12, kind: 'paymentLink', status: 'created', amountPaise: 1 }, booking(), [], now),
  ]
  const messages = plans.flatMap((plan) => plan.deliver)

  it('uses a template of its automation, on a channel the template allows', () => {
    for (const message of messages) {
      const spec = templateSpec(message.template as TemplateKey)
      expect(spec.automations).toContain(message.automation)
      expect(spec.channels).toContain(message.channel)
      expect(automation(message.automation).owner).toBe('B')
    }
  })

  it('is never promotional, so no marketing consent is asked and none is needed', () => {
    for (const message of messages) {
      const kind = templateSpec(message.template).kind
      expect(kind).not.toBe('promotional')
      const decision = decideSend({
        now: message.sendAt,
        channel: 'email',
        kind,
        hasAddress: true,
        suppressed: false,
        under18: true,
        automationEnabled: true,
        channelConfigured: true,
        templateApproved: true,
      })
      expect(decision).toEqual({ action: 'send' })
    }
  })

  it('has a key of its own', () => {
    const all = messages.map((message) => messageKey(message))
    expect(new Set(all).size).toBe(all.length)
  })
})
