import 'server-only'

import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import { readQuietHours } from '@/lib/settings/source'

import { runPlan, type CoreProvider, type PlanOutcome } from './core'
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
} from './plan'
import {
  bookingSnapshot,
  invoiceSnapshot,
  paymentLinkIds,
  paymentSnapshot,
  refundSnapshot,
} from './snapshot'
import type { Plan, PlanContext } from './types'
import { messagingCore } from './wiring'

/**
 * The B-series tasks' work (docs/19 §5): read the event from the job's input (ids only, checked
 * with Zod), read the records it is about, plan, and ask the core to cancel and record. Each task
 * is idempotent: run twice, the planners give the same message keys and the core writes each row
 * once; a cancellation of what is already cancelled cancels nothing.
 */

export const BOOKING_TASK_SLUGS = [
  'B2-confirmation',
  'B3-receipt',
  'B3a-consent-receipt',
  'B5-reminder-24h',
  'B6-reminder-2h',
  'B7-change-notice',
  'B8-feedback-request',
  'B9-no-show',
  'B10-slot-lost',
  'B12-time-request-ack',
  'B13-payment-link',
] as const
export type BookingTaskSlug = (typeof BOOKING_TASK_SLUGS)[number]

const Id = z.number().int().positive()

/** The events the B-series listens to, as the emitters write them into a job's input. */
export const BookingTaskEvent = z.discriminatedUnion('name', [
  z.object({
    name: z.literal('booking.confirmed'),
    bookingId: Id,
    cause: z.enum(['paymentCaptured', 'noPaymentAtBooking', 'timeAgreed', 'staff']),
  }),
  z.object({ name: z.literal('booking.rescheduled'), bookingId: Id, fromBookingId: Id }),
  z.object({ name: z.literal('booking.cancelled'), bookingId: Id, by: z.enum(['client', 'iiic']) }),
  z.object({ name: z.literal('booking.completed'), bookingId: Id }),
  z.object({ name: z.literal('booking.noShow'), bookingId: Id }),
  z.object({ name: z.literal('booking.slotLost'), bookingId: Id, paymentId: Id }),
  z.object({ name: z.literal('booking.requested'), bookingId: Id }),
  z.object({ name: z.literal('payment.linkSent'), paymentId: Id, bookingId: Id }),
  z.object({ name: z.literal('refund.processed'), refundId: Id }),
  z.object({ name: z.literal('invoice.issued'), invoiceId: Id, bookingId: Id }),
])
export type BookingTaskEvent = z.infer<typeof BookingTaskEvent>

export type BookingTaskOutput = PlanOutcome & {
  /** `done`, or `ignored` for an event this task does not take, or `bad-input`. */
  outcome: 'done' | 'ignored' | 'bad-input'
}

export type BookingTaskDeps = { core?: CoreProvider; now?: Date }

/** Thrown so the job is tried again and, after its retries, fails where the office sees it. */
export class CoreNotWired extends Error {
  constructor() {
    super('The messaging core is not wired; the job will be tried again.')
    this.name = 'CoreNotWired'
  }
}

const NOTHING: PlanOutcome = { cancelled: 0, planned: 0, created: 0, refused: [] }

async function planFor(
  req: PayloadRequest,
  slug: BookingTaskSlug,
  event: BookingTaskEvent,
  context: PlanContext,
): Promise<Plan | null> {
  switch (slug) {
    case 'B2-confirmation':
      if (event.name !== 'booking.confirmed') return null
      return planConfirmation(await bookingSnapshot(req, event.bookingId), context)
    case 'B3a-consent-receipt':
      if (event.name !== 'booking.confirmed') return null
      return planConsentReceipt(await bookingSnapshot(req, event.bookingId), context)
    case 'B3-receipt': {
      if (event.name !== 'invoice.issued') return null
      const invoice = await invoiceSnapshot(req, event.invoiceId)
      const bookingId = invoice?.bookingId ?? event.bookingId
      return planReceipt(invoice, await bookingSnapshot(req, bookingId), context)
    }
    case 'B5-reminder-24h':
    case 'B6-reminder-2h': {
      if (
        event.name !== 'booking.confirmed' &&
        event.name !== 'booking.rescheduled' &&
        event.name !== 'booking.cancelled'
      ) {
        return null
      }
      const plan = slug === 'B5-reminder-24h' ? planReminder24h : planReminderShort
      const booking = event.name === 'booking.cancelled' ? null : await bookingSnapshot(req, event.bookingId)
      return plan(event, booking, context)
    }
    case 'B7-change-notice': {
      if (event.name === 'booking.rescheduled' || event.name === 'booking.cancelled') {
        return planChangeNotice(event, await bookingSnapshot(req, event.bookingId), context)
      }
      if (event.name !== 'refund.processed') return null
      const refund = await refundSnapshot(req, event.refundId)
      const booking = refund?.bookingId ? await bookingSnapshot(req, refund.bookingId) : null
      return planRefundNotice(refund, booking, context)
    }
    case 'B8-feedback-request':
      if (event.name !== 'booking.completed') return null
      return planFeedbackRequest(await bookingSnapshot(req, event.bookingId), context)
    case 'B9-no-show':
      if (event.name !== 'booking.noShow') return null
      return planNoShow(await bookingSnapshot(req, event.bookingId), context)
    case 'B10-slot-lost':
      if (event.name !== 'booking.slotLost') return null
      return planSlotLost(event, await bookingSnapshot(req, event.bookingId), context)
    case 'B12-time-request-ack':
      if (event.name !== 'booking.requested') return null
      return planTimeRequestAck(await bookingSnapshot(req, event.bookingId), context)
    case 'B13-payment-link': {
      if (event.name === 'booking.cancelled') {
        return planPaymentLinkCancelled(await paymentLinkIds(req, event.bookingId))
      }
      if (event.name !== 'payment.linkSent') return null
      const payment = await paymentSnapshot(req, event.paymentId)
      const bookingId = payment?.bookingId ?? event.bookingId
      const earlier = (await paymentLinkIds(req, bookingId)).filter((id) => id !== event.paymentId)
      return planPaymentLink(payment, await bookingSnapshot(req, bookingId), earlier, context)
    }
  }
}

/** One B-series task's run: the handler of every task in src/jobs/bookingMessages.ts. */
export async function runBookingTask(
  slug: BookingTaskSlug,
  input: unknown,
  req: PayloadRequest,
  deps: BookingTaskDeps = {},
): Promise<BookingTaskOutput> {
  const parsed = BookingTaskEvent.safeParse(input)
  if (!parsed.success) {
    req.payload.logger.warn({ msg: 'Booking message task input refused', task: slug })
    return { outcome: 'bad-input', ...NOTHING }
  }
  const core = await (deps.core ?? messagingCore)()
  if (!core.ok) throw new CoreNotWired()
  const context: PlanContext = {
    now: deps.now ?? new Date(),
    quiet: await readQuietHours(req.payload),
  }
  const plan = await planFor(req, slug, parsed.data, context)
  if (!plan) return { outcome: 'ignored', ...NOTHING }
  const outcome = await runPlan(req, plan, core.value)
  if (outcome.refused.length) {
    req.payload.logger.info({ msg: 'Booking messages refused', task: slug, codes: outcome.refused })
  }
  return { outcome: 'done', ...outcome }
}
