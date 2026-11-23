import 'server-only'

import type { PayloadRequest } from 'payload'

import { confirmTimeRequest, type ApiError } from '@/lib/booking/api'
import { cancelBooking, rescheduleBooking } from '@/lib/booking/changes'
import { inTransaction, keepOk } from '@/lib/booking/guard'
import {
  calendarConnected,
  engineWindow,
  loadAvailability,
  loadBooking,
  loadRules,
  loadService,
  optionOf,
} from '@/lib/booking/load'
import { canMove, refundForCancellation } from '@/lib/booking/policies'
import { generateSlots } from '@/lib/booking/slots'
import { CAPTURED_STATES } from '@/lib/payments/moves'
import type { PaymentError } from '@/lib/payments/operations'
import { refundablePaise } from '@/lib/payments/refundRules'
import type { Payments } from '@/lib/payments/service'
import { err, ok, type Result } from '@/lib/result'
import type { Booking, Payment, Practitioner, Refund } from '@/payload-types'

import {
  CancelBody,
  ConfirmTimeBody,
  DecideBody,
  parseInput,
  PaymentLinkBody,
  PreviewQuery,
  RescheduleBody,
  type InvalidInput,
} from './inputs'
import { cancellationRefundKey, splitRefund } from './refundPlan'
import { refusalFor, type Need, type Refusal } from './who'

/**
 * The office's money and calendar actions (docs/16 §12, E; docs/05, Bookings, Money, Calendar):
 * cancel a booking with the refund shown first, move it, send a payment link, confirm a time
 * request, decide a refund waiting for an owner, send a failed refund again, and the preview of a
 * practitioner's bookable times. Each one checks the user, the role and the two-factor code
 * before it reads anything (CLAUDE.md #6), then calls the booking and payments modules, which
 * keep the states, the money and the double-booking guard. Every write goes through Payload in
 * the request, so the audit log records it with its actor; `req.context.auditAction` names the
 * action on those entries (src/plugins/auditLog.ts). No answer carries a person's details, a
 * note or a token (CLAUDE.md #3).
 */

export type OfficeError =
  | ApiError
  | PaymentError
  | InvalidInput
  | { code: Refusal['code'] }
  | { code: 'refund-changed'; clientPaise: number; iiicPaise: number }
  | { code: 'not-own-profile' }
  | { code: 'no-profile' }

export type OfficeDeps = {
  payments: Pick<
    Payments,
    'requestRefund' | 'decideRefund' | 'sendRefund' | 'sendRefunds' | 'sendPaymentLink'
  >
  now: () => Date
  /**
   * Whether IIIC's own messages can reach the client (email is set up, docs/19 §3): then B13's
   * message carries a payment link and the office is not asked to send it by hand. Unset, no.
   */
  messagesSetUp?: () => boolean
}

/** The audit log's name for each action's writes. */
export const AUDIT_ACTIONS = {
  cancel: 'cancel-booking',
  reschedule: 'reschedule-booking',
  confirmTime: 'confirm-time-request',
  paymentLink: 'send-payment-link',
  decideRefund: 'decide-refund',
  resendRefund: 'resend-refund',
} as const

type Ref = number | { id: number } | null | undefined
const idOf = (value: Ref): number | null =>
  typeof value === 'number' ? value : (value?.id ?? null)

function refuse(req: PayloadRequest, need: Need): Result<never, OfficeError> | null {
  const refusal = refusalFor(req.user, need)
  return refusal ? err({ code: refusal.code }) : null
}

function name(req: PayloadRequest, action: string) {
  req.context = { ...req.context, auditAction: action }
}

/** A booking and the ones it replaced, newest first: a reschedule keeps the payment on the first. */
async function chainOf(req: PayloadRequest, booking: Booking): Promise<number[]> {
  const chain = [booking.id]
  let from = idOf(booking.rescheduledFrom)
  while (from !== null && !chain.includes(from) && chain.length < 50) {
    chain.push(from)
    const previous = await loadBooking(req, from)
    from = previous ? idOf(previous.rescheduledFrom) : null
  }
  return chain
}

/** The captured payments on a booking's chain, the latest first. */
async function capturedPayments(req: PayloadRequest, booking: Booking): Promise<Payment[]> {
  const { docs } = await req.payload.find({
    collection: 'payments',
    where: {
      and: [
        { booking: { in: await chainOf(req, booking) } },
        { status: { in: [...CAPTURED_STATES] } },
      ],
    },
    sort: '-createdAt',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  return docs
}

export type CancelChoice = { allowed: boolean; refundPaise: number }

export type CancelPreview = {
  status: Booking['status']
  /** What the client has paid, net of refunds. */
  paidPaise: number
  /** Whether the service (or Settings) sets refund steps (D-16, I-07). */
  refundRuleSet: boolean
  client: CancelChoice
  iiic: CancelChoice
}

export function makeOfficeActions(deps: OfficeDeps) {
  /** The refund the policy gives now, for each side that may cancel (docs/05: shown first). */
  async function previewOf(req: PayloadRequest, booking: Booking): Promise<CancelPreview> {
    const now = deps.now()
    const service = await loadService(req, idOf(booking.service) as number)
    const rules = service ? await loadRules(req, service) : null
    const steps = rules?.ok ? rules.value.refundSteps : []
    const startsAt = booking.startsAt ? new Date(booking.startsAt) : now
    const paidPaise = (await capturedPayments(req, booking)).reduce(
      (sum, payment) => sum + Math.max(0, payment.amountPaise - (payment.refundedPaise ?? 0)),
      0,
    )
    const choice = (by: 'client' | 'iiic'): CancelChoice => ({
      allowed: canMove(booking.status, by === 'iiic' ? 'cancelledByIiic' : 'cancelledByClient'),
      refundPaise: refundForCancellation({ now, startsAt, paidPaise, steps, by }).refundPaise,
    })
    return {
      status: booking.status,
      paidPaise,
      refundRuleSet: steps.length > 0,
      client: choice('client'),
      iiic: choice('iiic'),
    }
  }

  return {
    /** The refund each side's cancellation gives, before anyone confirms it. The office only. */
    async cancelPreview(
      req: PayloadRequest,
      bookingId: number,
    ): Promise<Result<CancelPreview, OfficeError>> {
      const refused = refuse(req, 'office')
      if (refused) return refused
      const booking = await loadBooking(req, bookingId)
      if (!booking) return err({ code: 'not-found' })
      return ok(await previewOf(req, booking))
    },

    /**
     * Cancels a booking for the client or for IIIC, with the reason, and requests the refund the
     * policy gives (in full when IIIC cancels, D-16), spread over the booking's payments, in one
     * transaction: if the refund the page showed is no longer the policy's, or a refund is
     * refused, nothing changes. A refund within the threshold is approved and sent once the
     * transaction has committed; above it, or with no threshold, it waits for an owner.
     */
    async cancel(
      req: PayloadRequest,
      bookingId: number,
      raw: unknown,
    ): Promise<Result<{ booking: Booking; refunds: Refund[] }, OfficeError>> {
      const refused = refuse(req, 'office')
      if (refused) return refused
      const input = parseInput(CancelBody, raw)
      if (!input.ok) return input
      const { by, reason, shownClientPaise, shownIiicPaise } = input.value
      name(req, AUDIT_ACTIONS.cancel)

      const done = await inTransaction(
        req,
        async (): Promise<Result<{ booking: Booking; refunds: Refund[] }, OfficeError>> => {
          const before = await loadBooking(req, bookingId)
          if (!before) return err({ code: 'not-found' })
          const preview = await previewOf(req, before)
          const changed = err({
            code: 'refund-changed',
            clientPaise: preview.client.refundPaise,
            iiicPaise: preview.iiic.refundPaise,
          } as const)
          const shown = by === 'iiic' ? shownIiicPaise : shownClientPaise
          if (preview[by].refundPaise !== shown) return changed

          const cancelled = await cancelBooking(req, {
            bookingId,
            by,
            reason,
            asker: 'staff',
            now: deps.now(),
          })
          if (!cancelled.ok) return cancelled
          const { booking, refundPaise } = cancelled.value
          // Worked out again under the booking's lock: a payment or a step may have moved since.
          if (refundPaise !== shown) return changed
          if (refundPaise === 0) return ok({ booking, refunds: [] })

          // One query at a time: they share the transaction's one connection.
          const refundable = []
          for (const payment of await capturedPayments(req, booking)) {
            refundable.push({
              paymentId: payment.id,
              refundablePaise: await refundablePaise(req, payment),
            })
          }
          const parts = splitRefund(refundPaise, refundable)
          if (!parts.ok) return parts
          const refunds: Refund[] = []
          for (const part of parts.value) {
            const requested = await deps.payments.requestRefund(req, {
              paymentId: part.paymentId,
              amountPaise: part.amountPaise,
              reason: by === 'iiic' ? 'cancelledByIiic' : 'cancelledByClient',
              idempotencyKey: cancellationRefundKey(booking.id, part.paymentId),
              by: 'staff',
            })
            if (!requested.ok) return requested
            refunds.push(requested.value)
          }
          return ok({ booking, refunds })
        },
        keepOk,
      )
      if (done.ok) {
        const approved = done.value.refunds.filter((refund) => refund.status === 'approved')
        if (approved.length) {
          await deps.payments.sendRefunds(
            req.payload,
            approved.map((refund) => refund.id),
          )
        }
      }
      return done
    },

    /**
     * Moves a booking to a new time (docs/05: "Reschedule → pick a time"): any time ahead that
     * the guard finds free, not limited by the client's window. The new booking gets no manage
     * link here: whoever sends its confirmation issues one (M6).
     */
    async reschedule(
      req: PayloadRequest,
      bookingId: number,
      raw: unknown,
    ): Promise<Result<Booking, OfficeError>> {
      const refused = refuse(req, 'office')
      if (refused) return refused
      const input = parseInput(RescheduleBody, raw)
      if (!input.ok) return input
      name(req, AUDIT_ACTIONS.reschedule)
      return rescheduleBooking(req, {
        bookingId,
        startsAt: input.value.startsAt,
        by: 'staff',
        now: deps.now(),
      })
    },

    /** Confirms a time request at the time agreed with the client (docs/03 F3; B2). */
    async confirmTime(
      req: PayloadRequest,
      bookingId: number,
      raw: unknown,
    ): Promise<Result<Booking, OfficeError>> {
      const refused = refuse(req, 'office')
      if (refused) return refused
      const input = parseInput(ConfirmTimeBody, raw)
      if (!input.ok) return input
      name(req, AUDIT_ACTIONS.confirmTime)
      const confirmed = await confirmTimeRequest(
        req,
        {
          bookingId,
          startsAt: input.value.startsAt.toISOString(),
          ...(input.value.practitionerId ? { practitionerId: input.value.practitionerId } : {}),
        },
        deps.now(),
      )
      if (!confirmed.ok) return confirmed
      const booking = await loadBooking(req, confirmed.value.booking.id)
      return booking ? ok(booking) : err({ code: 'not-found' })
    },

    /**
     * Sends a payment link for a confirmed booking with a price (D-24, B13). Its amount is the
     * booking's own total, which the client sees before paying; the gateway sends nothing itself.
     */
    async paymentLink(
      req: PayloadRequest,
      bookingId: number,
      raw: unknown,
    ): Promise<Result<{ payment: Payment; shortUrl: string; messaged: boolean }, OfficeError>> {
      const refused = refuse(req, 'office')
      if (refused) return refused
      const input = parseInput(PaymentLinkBody, raw)
      if (!input.ok) return input
      name(req, AUDIT_ACTIONS.paymentLink)
      const sent = await deps.payments.sendPaymentLink(req, {
        bookingId,
        expiresAt: input.value.expiresAt ?? null,
      })
      // B13 (M6) sends the link on `payment.linkSent` when the messages can reach the client.
      return sent.ok ? ok({ ...sent.value, messaged: deps.messagesSetUp?.() ?? false }) : sent
    },

    /**
     * An owner, with their code entered, approves or declines a refund waiting for them; an
     * approved one is sent to the gateway once the decision has committed.
     */
    async decideRefund(
      req: PayloadRequest,
      refundId: number,
      raw: unknown,
    ): Promise<Result<Refund, OfficeError>> {
      const refused = refuse(req, 'owner')
      if (refused) return refused
      const input = parseInput(DecideBody, raw)
      if (!input.ok) return input
      name(req, AUDIT_ACTIONS.decideRefund)
      const decided = await deps.payments.decideRefund(req, {
        refundId,
        decision: input.value.decision,
      })
      if (!decided.ok || decided.value.status !== 'approved') return decided
      // Sent only now, after the decision has committed: never twice (docs/16 §5).
      const sent = await deps.payments.sendRefund(req.payload, refundId, req.user)
      return ok(sent.ok ? sent.value : decided.value)
    },

    /** Sends a refund the gateway refused again (docs/16 §3: "a failed one is sent again by hand"). */
    async resendRefund(
      req: PayloadRequest,
      refundId: number,
    ): Promise<Result<Refund, OfficeError>> {
      const refused = refuse(req, 'office')
      if (refused) return refused
      const refund = await req.payload
        .findByID({ collection: 'refunds', id: refundId, depth: 0, overrideAccess: true, req })
        .catch(() => null)
      if (!refund) return err({ code: 'not-found' })
      if (refund.status !== 'failed') {
        return err({ code: 'bad-move', from: refund.status, to: 'processing' })
      }
      name(req, AUDIT_ACTIONS.resendRefund)
      return deps.payments.sendRefund(req.payload, refundId, req.user)
    },

    /**
     * The times a client would be offered for one service's option with one practitioner, from
     * their working hours, exceptions, busy times and bookings (docs/05, Calendar: "a preview of
     * the resulting bookable times"). The office for anyone; a practitioner for their own profile.
     * Shown whether or not the calendar is connected, with that state, since clients are offered
     * none until it is (docs/16 §7).
     */
    async previewHours(
      req: PayloadRequest,
      raw: unknown,
    ): Promise<
      Result<
        {
          practitionerId: number
          calendarConnected: boolean
          days: { day: string; starts: string[] }[]
        },
        OfficeError
      >
    > {
      const refused = refuse(req, 'hours')
      if (refused) return refused
      const input = parseInput(PreviewQuery, raw)
      if (!input.ok) return input
      const whose = await whoseHours(req, input.value.practitionerId)
      if (!whose.ok) return whose
      const practitionerId = whose.value.id
      const service = await loadService(req, input.value.option.serviceId)
      const option = service ? optionOf(service, input.value.option.serviceOption) : null
      if (!service || !option) return err({ code: 'not-found' })
      const rules = await loadRules(req, service)
      if (!rules.ok) return err({ code: 'rule-missing' })
      const now = deps.now()
      const availability = await loadAvailability(req, {
        practitionerId,
        window: engineWindow(now, rules.value.horizonDays),
        now,
      })
      const days = generateSlots({
        now,
        durationMinutes: option.durationMinutes,
        rules: rules.value,
        hours: availability.hours,
        exceptions: availability.exceptions,
        taken: [...availability.busy, ...availability.booked],
      })
      return ok({
        practitionerId,
        calendarConnected: await calendarConnected(req, practitionerId),
        days: days.map((day) => ({
          day: day.day,
          starts: day.starts.map((start) => start.toISOString()),
        })),
      })
    },

    whoseHours,
  }
}

/**
 * Whose working hours a request may see: a practitioner's own profile (the one whose staff
 * account is theirs), or for the office any profile it names.
 */
export async function whoseHours(
  req: PayloadRequest,
  practitionerId: number | undefined,
): Promise<Result<Practitioner, OfficeError>> {
  const refused = refuse(req, 'hours')
  if (refused) return refused
  const user = req.user as { id: number }
  if (refusalFor(req.user, 'office') === null) {
    if (practitionerId === undefined) {
      return err({ code: 'invalid-input', fields: ['practitionerId'] })
    }
    const profile = await req.payload
      .findByID({
        collection: 'practitioners',
        id: practitionerId,
        depth: 0,
        overrideAccess: true,
        req,
      })
      .catch(() => null)
    return profile ? ok(profile) : err({ code: 'not-found' })
  }
  const { docs } = await req.payload.find({
    collection: 'practitioners',
    where: { staff: { equals: user.id } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
  })
  const own = docs[0]
  if (!own) return err({ code: 'no-profile' })
  if (practitionerId !== undefined && practitionerId !== own.id) {
    return err({ code: 'not-own-profile' })
  }
  return ok(own)
}

export type OfficeActions = ReturnType<typeof makeOfficeActions>
