import type { TemplateKey } from '@/emails/registry'
import type { AutomationId } from '@/lib/automations/catalogue'
import { after, OFFSETS, reminder24hAt, reminderShortAt } from '@/lib/automations/timing'
import type { DomainEvent } from '@/lib/booking/events'
import { messageKey, type PlannedMessage } from '@/lib/messaging/operations'
import { plannedSendTime } from '@/lib/messaging/policy'
import type { Channel, Subject } from '@/lib/messaging/types'

import { EMPTY_PLAN, type BookingSnapshot, type Plan, type PlanContext } from './types'

/**
 * The B-series planners (docs/06 B2 to B13; docs/19 §5, §6), pure: given the event, the records
 * it is about as they stand and the clock, what to cancel and what to record. The core
 * (`deliver`) writes one row per message key and sends nothing twice; the core (`dispatch`)
 * checks consent, the suppression list and the quiet hours again when each is due. A planner
 * only decides which messages exist, on which channel, and when they are due.
 *
 * Re-planning (docs/19 §6): a reschedule cancels the old booking's queued reminders before the new
 * booking's are planned; a cancellation cancels them; each automation cancels only its own rows,
 * so a change notice already queued is never cancelled by another task's retry.
 */

const bookingSubject = (id: number): Subject => ({ collection: 'bookings', id })

/** A message to the booking's client (or whoever booked for them). */
function toClient(
  booking: BookingSnapshot,
  automation: AutomationId,
  template: TemplateKey,
  channel: Channel,
  rest: Omit<PlannedMessage, 'automation' | 'template' | 'channel' | 'recipient' | 'subject'> & {
    subject?: Subject
  },
): PlannedMessage {
  return {
    automation,
    template,
    channel,
    recipient: { kind: 'person', id: booking.recipientId },
    subject: rest.subject ?? bookingSubject(booking.id),
    ...rest,
  }
}

/** Email always; WhatsApp as well unless the person asked for email (docs/06, Engine rules). */
function emailAndWhatsApp(
  booking: BookingSnapshot,
  build: (channel: Channel) => PlannedMessage,
): PlannedMessage[] {
  return booking.prefersEmail ? [build('email')] : [build('email'), build('whatsapp')]
}

const isConfirmed = (booking: BookingSnapshot | null | undefined): booking is BookingSnapshot =>
  booking?.status === 'confirmed'

// ---- B2 · the confirmation, and B3a · the counselling consent receipt ----

/** B2: at once, by email and (unless the person prefers email) WhatsApp. */
export function planConfirmation(booking: BookingSnapshot | null, context: PlanContext): Plan {
  if (!isConfirmed(booking)) return EMPTY_PLAN
  return {
    cancel: [],
    deliver: emailAndWhatsApp(booking, (channel) =>
      toClient(booking, 'B2', 'booking-confirmed', channel, {
        sendAt: context.now,
        sendBefore: booking.startsAt,
      }),
    ),
  }
}

/**
 * B3a: with B2, by email, for a counselling booking only, and only when consents were recorded
 * with it (a booking the office entered has none, and a receipt would have nothing to list).
 */
export function planConsentReceipt(booking: BookingSnapshot | null, context: PlanContext): Plan {
  if (!isConfirmed(booking) || !booking.counselling || booking.consents < 1) return EMPTY_PLAN
  return {
    cancel: [],
    deliver: [toClient(booking, 'B3a', 'consent-receipt', 'email', { sendAt: context.now })],
  }
}

// ---- B5 and B6 · the reminders ----

/**
 * B5's message for a confirmed booking: 24 hours before, on WhatsApp with email as its fallback
 * (email only for someone who prefers it); none for a booking confirmed less than 24 hours ahead.
 */
export function reminder24h(booking: BookingSnapshot, context: PlanContext): PlannedMessage[] {
  if (!isConfirmed(booking) || !booking.startsAt || !booking.confirmedAt) return []
  const due = reminder24hAt({
    startsAt: booking.startsAt,
    confirmedAt: booking.confirmedAt,
    format: booking.format ?? 'office',
    now: context.now,
  })
  if (!due) return []
  const channel: Channel = booking.prefersEmail ? 'email' : 'whatsapp'
  return [
    toClient(booking, 'B5', 'reminder-24h', channel, {
      ...(channel === 'whatsapp' ? { fallback: 'email' as const } : {}),
      sendAt: plannedSendTime(due, channel, context.quiet, booking.startsAt) ?? due,
      sendBefore: booking.startsAt,
    }),
  ]
}

/**
 * B6's message: 2 hours before an office session, 30 minutes before an online one, on WhatsApp
 * only. When the quiet hours would push it past the start it is still recorded at its own time,
 * so the core skips it as `quiet-hours-late` where the office can see it (docs/06 B6).
 */
export function reminderShort(booking: BookingSnapshot, context: PlanContext): PlannedMessage[] {
  if (!isConfirmed(booking) || !booking.startsAt || booking.prefersEmail) return []
  const due = reminderShortAt({
    startsAt: booking.startsAt,
    confirmedAt: booking.confirmedAt ?? context.now,
    format: booking.format ?? 'office',
    now: context.now,
  })
  if (!due) return []
  return [
    toClient(booking, 'B6', 'reminder-short', 'whatsapp', {
      sendAt: plannedSendTime(due, 'whatsapp', context.quiet, booking.startsAt) ?? due,
      sendBefore: booking.startsAt,
    }),
  ]
}

type ReminderEvent = Extract<
  DomainEvent,
  { name: 'booking.confirmed' | 'booking.rescheduled' | 'booking.cancelled' }
>

/**
 * B5 and B6 on their three events: a confirmation plans; a reschedule cancels the old booking's
 * queued reminder, then plans the new booking's; a cancellation cancels.
 */
function planReminders(
  automation: 'B5' | 'B6',
  build: (booking: BookingSnapshot, context: PlanContext) => PlannedMessage[],
) {
  return (event: ReminderEvent, booking: BookingSnapshot | null, context: PlanContext): Plan => {
    switch (event.name) {
      case 'booking.confirmed':
        return { cancel: [], deliver: booking ? build(booking, context) : [] }
      case 'booking.rescheduled':
        return {
          cancel: [{ subject: bookingSubject(event.fromBookingId), automations: [automation] }],
          deliver: booking ? build(booking, context) : [],
        }
      case 'booking.cancelled':
        return {
          cancel: [{ subject: bookingSubject(event.bookingId), automations: [automation] }],
          deliver: [],
        }
    }
  }
}

export const planReminder24h = planReminders('B5', reminder24h)
export const planReminderShort = planReminders('B6', reminderShort)

// ---- B7 · rescheduled, cancelled, refunded ----

/** The practitioner's staff account, told of a change by email from the platform (internal). */
function toStaff(
  booking: BookingSnapshot,
  automation: 'B7' | 'B10',
  subject: Subject,
  variant: string,
  context: PlanContext,
): PlannedMessage[] {
  if (booking.staffId === null) return []
  return [
    {
      automation,
      template: 'booking-change-staff',
      channel: 'email',
      recipient: { kind: 'staff', id: booking.staffId },
      subject,
      variant,
      sendAt: context.now,
    },
  ]
}

/**
 * B7 for a booking moved or cancelled: the client by email and WhatsApp, the practitioner by
 * email. Each notice has a variant of its own, so a booking moved and later cancelled gets both.
 */
export function planChangeNotice(
  event: Extract<DomainEvent, { name: 'booking.rescheduled' | 'booking.cancelled' }>,
  booking: BookingSnapshot | null,
  context: PlanContext,
): Plan {
  if (!booking) return EMPTY_PLAN
  const moved = event.name === 'booking.rescheduled'
  if (moved ? booking.status !== 'confirmed' : !CANCELLED.has(booking.status)) return EMPTY_PLAN
  const template: TemplateKey = moved ? 'booking-rescheduled' : 'booking-cancelled'
  const variant = moved ? 'rescheduled' : 'cancelled'
  return {
    cancel: [],
    deliver: [
      ...emailAndWhatsApp(booking, (channel) =>
        toClient(booking, 'B7', template, channel, {
          variant,
          sendAt: context.now,
          ...(moved ? { sendBefore: booking.startsAt } : {}),
        }),
      ),
      ...toStaff(booking, 'B7', bookingSubject(booking.id), `staff-${variant}`, context),
    ],
  }
}

const CANCELLED: ReadonlySet<BookingSnapshot['status']> = new Set([
  'cancelledByClient',
  'cancelledByIiic',
])

/** The refund as the planner needs it: ids and the state, never the amount. */
export type RefundSnapshot = { id: number; status: string }

/** B7 for a processed refund: the person told by email (their own amount, D-24). */
export function planRefundNotice(
  refund: RefundSnapshot | null,
  booking: BookingSnapshot | null,
  context: PlanContext,
): Plan {
  if (!refund || refund.status !== 'processed' || !booking) return EMPTY_PLAN
  return {
    cancel: [],
    deliver: [
      toClient(booking, 'B7', 'refund-processed', 'email', {
        subject: { collection: 'refunds', id: refund.id },
        sendAt: context.now,
      }),
    ],
  }
}

// ---- B3 · the receipt ----

export type InvoiceSnapshot = { id: number; status: string }

/** B3: the receipt or invoice Zoho Books issued, by email at once. */
export function planReceipt(
  invoice: InvoiceSnapshot | null,
  booking: BookingSnapshot | null,
  context: PlanContext,
): Plan {
  if (!invoice || invoice.status !== 'issued' || !booking) return EMPTY_PLAN
  return {
    cancel: [],
    deliver: [
      toClient(booking, 'B3', 'booking-receipt', 'email', {
        subject: { collection: 'invoices', id: invoice.id },
        sendAt: context.now,
      }),
    ],
  }
}

// ---- B8, B9 · after the session ----

/**
 * Whether the feedback page B8 links to exists (`/feedback/[token]`, its tokens and its form). It
 * does not yet (docs/19 §10; I-17): M5 built the `feedback` collection the form writes to, not the
 * public page, so B8 is wired to `booking.completed` and plans nothing until this is true.
 */
export const FEEDBACK_PAGE_BUILT = false

/** B8: 2 hours after the session is marked completed, by email. */
export function planFeedbackRequest(booking: BookingSnapshot | null, context: PlanContext): Plan {
  if (booking?.status !== 'completed') return EMPTY_PLAN
  return {
    cancel: [],
    deliver: [
      toClient(booking, 'B8', 'feedback-request', 'email', {
        sendAt: after(context.now, OFFSETS.feedbackAfterCompleted),
      }),
    ],
  }
}

/** B9: 1 hour after the session is marked no-show, by email only (never WhatsApp, docs/06). */
export function planNoShow(booking: BookingSnapshot | null, context: PlanContext): Plan {
  if (booking?.status !== 'noShow') return EMPTY_PLAN
  return {
    cancel: [],
    deliver: [
      toClient(booking, 'B9', 'no-show', 'email', {
        sendAt: after(context.now, OFFSETS.noShowAfterMarked),
      }),
    ],
  }
}

// ---- B10 · the slot was lost at confirmation ----

/** B10: at once, by email to the person (their refund) and to the practitioner. */
export function planSlotLost(
  event: Extract<DomainEvent, { name: 'booking.slotLost' }>,
  booking: BookingSnapshot | null,
  context: PlanContext,
): Plan {
  if (!booking) return EMPTY_PLAN
  const subject: Subject = { collection: 'payments', id: event.paymentId }
  return {
    cancel: [],
    deliver: [
      toClient(booking, 'B10', 'slot-lost', 'email', { subject, sendAt: context.now }),
      ...toStaff(booking, 'B10', subject, 'staff', context),
    ],
  }
}

// ---- B12 · a time request ----

/** B12: at once, by email and WhatsApp; it promises no time (docs/06). */
export function planTimeRequestAck(booking: BookingSnapshot | null, context: PlanContext): Plan {
  if (booking?.status !== 'requested') return EMPTY_PLAN
  return {
    cancel: [],
    deliver: emailAndWhatsApp(booking, (channel) =>
      toClient(booking, 'B12', 'time-request-received', channel, { sendAt: context.now }),
    ),
  }
}

// ---- B13 · a payment link staff sent ----

/** The payment as the planner needs it. The amount only says whether there is one. */
export type PaymentSnapshot = { id: number; kind: string; status: string; amountPaise: number }

const paymentSubject = (id: number): Subject => ({ collection: 'payments', id })

/**
 * B13 on `payment.linkSent`: the link at once by email and WhatsApp, and one email reminder 24
 * hours before the session while it is unpaid (docs/19 §10). The booking's earlier links were
 * cancelled when this one was made, so their reminders are cancelled first. Never for a free
 * service (docs/06 B13).
 */
export function planPaymentLink(
  payment: PaymentSnapshot | null,
  booking: BookingSnapshot | null,
  earlierPaymentIds: readonly number[],
  context: PlanContext,
): Plan {
  const cancel = earlierPaymentIds.map((id) => ({
    subject: paymentSubject(id),
    automations: ['B13'] as const,
  }))
  if (!payment || payment.kind !== 'paymentLink' || payment.status !== 'created') {
    return { cancel, deliver: [] }
  }
  if (payment.amountPaise <= 0 || !isConfirmed(booking)) return { cancel, deliver: [] }
  const subject = paymentSubject(payment.id)
  const deliver = emailAndWhatsApp(booking, (channel) =>
    toClient(booking, 'B13', 'payment-link', channel, {
      subject,
      sendAt: context.now,
      sendBefore: booking.startsAt,
    }),
  )
  if (booking.startsAt) {
    const due = new Date(booking.startsAt.getTime() - OFFSETS.paymentLinkReminder)
    if (due.getTime() > context.now.getTime()) {
      deliver.push(
        toClient(booking, 'B13', 'payment-link-reminder', 'email', {
          subject,
          variant: 'reminder',
          sendAt: due,
          sendBefore: booking.startsAt,
        }),
      )
    }
  }
  return { cancel, deliver }
}

/**
 * B13 on `booking.rescheduled`: the payment link stays as sent (it pays for the booking wherever it
 * moves), but its reminder belongs to the old time. The queued B13 rows of every link in the
 * chain are cancelled, and while the newest link is still open, one reminder is planned for the
 * new time, keyed by the new booking so it is a new row; a retry of the same run keeps it.
 */
export function planPaymentLinkMoved(
  payment: PaymentSnapshot | null,
  booking: BookingSnapshot | null,
  linkIds: readonly number[],
  context: PlanContext,
): Plan {
  const reminder =
    payment &&
    payment.kind === 'paymentLink' &&
    payment.status === 'created' &&
    payment.amountPaise > 0 &&
    isConfirmed(booking) &&
    booking.startsAt
      ? toClient(booking, 'B13', 'payment-link-reminder', 'email', {
          subject: paymentSubject(payment.id),
          variant: `reminder-${booking.id}`,
          sendAt: new Date(booking.startsAt.getTime() - OFFSETS.paymentLinkReminder),
          sendBefore: booking.startsAt,
        })
      : null
  const deliver = reminder && reminder.sendAt.getTime() > context.now.getTime() ? [reminder] : []
  const keepKeys = deliver.map((message) => messageKey(message))
  return {
    cancel: linkIds.map((id) => ({
      subject: paymentSubject(id),
      automations: ['B13'] as const,
      ...(keepKeys.length ? { keepKeys } : {}),
    })),
    deliver,
  }
}

/** B13 on `booking.cancelled`: every queued payment-link message of the booking is cancelled. */
export function planPaymentLinkCancelled(paymentIds: readonly number[]): Plan {
  return {
    cancel: paymentIds.map((id) => ({ subject: paymentSubject(id), automations: ['B13'] })),
    deliver: [],
  }
}
