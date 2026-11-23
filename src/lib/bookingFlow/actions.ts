'use server'

import { z } from 'zod'

import {
  askForTime,
  bookSlot,
  cancel,
  findByManageToken,
  listSlots,
  reschedule,
  type PriceSource,
} from '@/lib/booking/api'
import { inTransaction, keepOk } from '@/lib/booking/guard'
import { extendHold } from '@/lib/booking/holds'
import { loadBooking, loadService } from '@/lib/booking/load'
import { env } from '@/lib/env'
import { FakeGateway } from '@/lib/payments/fakeGateway'
import { gatewayFor } from '@/lib/payments/gatewayFor'
import { quotePrice } from '@/lib/payments/prices'
import { payments } from '@/lib/payments/wiring'
import { readFlags } from '@/lib/settings/source'

import { consentTextsInForce } from './catalogue'
import { requestClientRefund } from './clientRefund'
import { consentsGiven, isFlowType, parseDetails, REQUIRED_CONSENT } from './details'
import { bookInfoSession } from './info'
import { recordPersonAndConsents } from './people'
import {
  bookingForThisBrowser,
  countStep,
  flowPayload,
  flowRequest,
  requestEvidence,
  setBookingCookie,
} from './server'

/**
 * The booking flow's server actions (docs/03 F3, F4; docs/16 §5, §6). Each one checks its input
 * with Zod first, and then who is asking: a visitor may list times and book; the payment step and
 * the confirmation act only for the browser that made the booking (the booking cookie); the
 * manage page acts only with its link's token. The booking module and the payments module do the
 * work, on the server; the browser's word confirms nothing (CLAUDE.md #5). No answer carries a
 * person's details, a token hash or, while prices are hidden, a price.
 */

export type ActionError =
  | { code: 'invalid-input'; fields: { field: string; message: string }[] }
  | { code: 'consent-text-missing' }
  | { code: 'slot-taken' }
  | { code: 'outside-hours' }
  | { code: 'hold-expired' }
  | { code: 'rule-missing' }
  | { code: 'not-allowed'; reason?: string }
  | { code: 'full' }
  | { code: 'not-found' }
  | { code: 'gateway-down'; holdExpiresAt: string | null }
  | { code: 'payments-off' }
  | { code: 'failed' }

type Answer<T> = { ok: true; value: T } | { ok: false; error: ActionError }

const fail = <T>(error: ActionError): Answer<T> => ({ ok: false, error })

/** A booking module error, as the flow explains it. */
function fromBooking(error: { code: string; reason?: string }): ActionError {
  switch (error.code) {
    case 'slot-taken':
    case 'outside-hours':
    case 'hold-expired':
    case 'rule-missing':
    case 'not-found':
    case 'full':
      return { code: error.code }
    case 'not-allowed':
      return { code: 'not-allowed', reason: error.reason }
    case 'started':
      return { code: 'not-allowed', reason: 'started' }
    case 'invalid-input':
      return { code: 'invalid-input', fields: [] }
    default:
      return { code: 'failed' }
  }
}

/** The price source the booking module copies a session's price from (docs/16 §5). */
const priceSource: PriceSource = async (req, input) => {
  const quote = await quotePrice(req, input)
  return quote.ok ? quote.value : null
}

const Id = z.number().int().positive()
const Reference = z.string().regex(/^IIIC-[SCI]-\d{5}$/)
const ManageToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const CheckoutKey = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/)
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Format = z.enum(['online', 'office']).optional()

// ---- Step 2: when ----

const ListInput = z.strictObject({
  serviceId: Id,
  serviceOption: z.string().max(64),
  practitionerId: Id,
})

export async function listTimesAction(
  raw: unknown,
): Promise<Answer<{ days: { day: string; starts: string[] }[] }>> {
  const input = ListInput.safeParse(raw)
  if (!input.success) return fail({ code: 'invalid-input', fields: [] })
  const listed = await listSlots(await flowRequest(), input.data)
  return listed.ok ? { ok: true, value: listed.value } : fail(fromBooking(listed.error))
}

// ---- Step 3: details, then the booking ----

const Choice = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('slot'),
    serviceId: Id,
    serviceOption: z.string().max(64),
    practitionerId: Id,
    startsAt: z.iso.datetime({ offset: true }),
    format: Format,
  }),
  z.strictObject({
    kind: z.literal('request'),
    serviceId: Id,
    serviceOption: z.string().max(64),
    practitionerId: Id.optional(),
    preferredDays: z.array(Day).min(1).max(14),
    preferredTimes: z.string().trim().max(200).optional(),
    note: z.string().trim().max(1000).optional(),
    format: Format,
  }),
  z.strictObject({ kind: z.literal('event'), eventId: Id }),
])

const SubmitInput = z.strictObject({
  type: z.string(),
  checkoutKey: CheckoutKey,
  choice: Choice,
  details: z.record(z.string(), z.unknown()),
})

export type Submitted = {
  ref: string
  next: 'pay' | 'confirmed' | 'requested'
}

export async function submitBookingAction(raw: unknown): Promise<Answer<Submitted>> {
  const input = SubmitInput.safeParse(raw)
  if (!input.success || !isFlowType(input.data.type)) {
    return fail({ code: 'invalid-input', fields: [] })
  }
  const type = input.data.type
  const details = parseDetails({ ...input.data.details, type })
  if (!details.ok) return fail({ code: 'invalid-input', fields: details.errors })
  const choice = input.data.choice
  if ((type === 'info') !== (choice.kind === 'event')) {
    return fail({ code: 'invalid-input', fields: [] })
  }

  const payload = await flowPayload()
  const req = await flowRequest(payload)
  const now = new Date()
  if (choice.kind !== 'event') {
    const service = await loadService(req, choice.serviceId)
    if (!service || service.type !== type) return fail({ code: 'not-found' })
  }
  const given = consentsGiven(details.value)
  const texts = await consentTextsInForce(req, given, now)
  if (!texts.some((text) => text.purpose === REQUIRED_CONSENT)) {
    return fail({ code: 'consent-text-missing' })
  }
  const evidence = await requestEvidence()
  const sessionDetails = details.value.type === 'session' ? details.value : null
  const callDetails = details.value.type === 'call' ? details.value : null
  const flowDetails = {
    ...(sessionDetails ? { whoFor: sessionDetails.whoFor, ageBand: sessionDetails.ageBand } : {}),
    ...(callDetails
      ? {
          company: {
            name: callDetails.company,
            role: callDetails.role || undefined,
            teamSize: callDetails.teamSize || undefined,
            sector: callDetails.sector || undefined,
          },
        }
      : {}),
    source: 'booking',
  }

  const done = await inTransaction(
    req,
    async (): Promise<Answer<Submitted & { manageToken: string | null }>> => {
      const { personId, consentIds } = await recordPersonAndConsents(req, {
        details: details.value,
        given,
        texts,
        evidence: { form: `booking:${type}`, ...evidence },
        source: 'booking',
        now,
      })
      const context = { personId, consents: consentIds, price: priceSource, now }
      if (choice.kind === 'event') {
        const booked = await bookInfoSession(req, {
          eventId: choice.eventId,
          checkoutKey: input.data.checkoutKey,
          personId,
          consents: consentIds,
          now,
        })
        return booked.ok
          ? {
              ok: true,
              value: {
                ref: booked.value.booking.reference,
                next: 'confirmed',
                manageToken: booked.value.manageToken,
              },
            }
          : fail(fromBooking(booked.error))
      }
      if (choice.kind === 'request') {
        const { kind: _kind, ...request } = choice
        const asked = await askForTime(req, { ...request, ...flowDetails }, context)
        return asked.ok
          ? {
              ok: true,
              value: {
                ref: asked.value.booking.reference,
                next: 'requested',
                manageToken: asked.value.manageToken,
              },
            }
          : fail(fromBooking(asked.error))
      }
      const { kind: _kind, ...slot } = choice
      const booked = await bookSlot(
        req,
        { ...slot, checkoutKey: input.data.checkoutKey, ...flowDetails },
        context,
      )
      return booked.ok
        ? {
            ok: true,
            value: {
              ref: booked.value.booking.reference,
              next: booked.value.next,
              manageToken: booked.value.manageToken,
            },
          }
        : fail(fromBooking(booked.error))
    },
    keepOk,
  )
  if (!done.ok) return done
  await setBookingCookie({
    ref: done.value.ref,
    key: choice.kind === 'request' ? null : input.data.checkoutKey,
    token: done.value.manageToken,
  })
  const funnel = { whoFor: sessionDetails?.whoFor, ageBand: sessionDetails?.ageBand }
  if (done.value.next === 'requested') await countStep('request_submitted', type, funnel)
  else {
    await countStep('time_chosen', type, funnel)
    if (done.value.next === 'confirmed') await countStep('booking_confirmed', type, funnel)
  }
  return { ok: true, value: { ref: done.value.ref, next: done.value.next } }
}

// ---- Step 4: payment ----

const RefInput = z.strictObject({ ref: Reference })

export type CheckoutOpened = { orderId: string; keyId: string; fake: boolean }

/**
 * Opens checkout for the hold this browser placed (docs/16 §5): one order per booking, the
 * amount the server copied into it. A gateway that does not answer keeps the hold once more
 * (docs/03 F3, "keep the hold for one retry") and says so.
 */
export async function openCheckoutAction(raw: unknown): Promise<Answer<CheckoutOpened>> {
  const input = RefInput.safeParse(raw)
  if (!input.success) return fail({ code: 'invalid-input', fields: [] })
  const payload = await flowPayload()
  const req = await flowRequest(payload)
  const booking = await bookingForThisBrowser(req, input.data.ref)
  if (!booking) return fail({ code: 'not-found' })
  const opened = await payments().openCheckout(req, { bookingId: booking.id })
  if (opened.ok) {
    const gateway = gatewayFor(env())
    return {
      ok: true,
      value: {
        orderId: opened.value.orderId,
        keyId: opened.value.keyId,
        fake: gateway.ok && gateway.value.name === 'fake',
      },
    }
  }
  switch (opened.error.code) {
    case 'not-configured':
    case 'prices-hidden':
      return fail({ code: 'payments-off' })
    case 'unavailable': {
      const kept = await extendHold(await flowRequest(payload), { bookingId: booking.id })
      return fail({
        code: 'gateway-down',
        holdExpiresAt: kept.ok
          ? (kept.value.holdExpiresAt ?? null)
          : (booking.holdExpiresAt ?? null),
      })
    }
    case 'bad-move':
      return fail({ code: 'hold-expired' })
    default:
      return fail({ code: 'failed' })
  }
}

const ReturnInput = z.strictObject({
  ref: Reference,
  orderId: z.string().min(1).max(64),
  paymentId: z.string().min(1).max(64),
  signature: z.string().min(1).max(256),
})

/**
 * The browser is back from checkout: the server asks the gateway about the order once, and only
 * when checkout's signature is right; otherwise the webhook settles it (docs/16 §5).
 */
export async function checkoutReturnedAction(raw: unknown): Promise<Answer<BookingState>> {
  const input = ReturnInput.safeParse(raw)
  if (!input.success) return fail({ code: 'invalid-input', fields: [] })
  const payload = await flowPayload()
  const booking = await bookingForThisBrowser(await flowRequest(payload), input.data.ref)
  if (!booking) return fail({ code: 'not-found' })
  await payments().verifyReturnedPayment(payload, {
    bookingId: booking.id,
    orderId: input.data.orderId,
    paymentId: input.data.paymentId,
    signature: input.data.signature,
  })
  return bookingStateAction({ ref: input.data.ref })
}

export type BookingState = {
  status: string
  paymentStatus: string
  holdExpiresAt: string | null
  /** The time was taken before the payment arrived: the payment is being refunded (B10). */
  slotLost: boolean
  /** A payment attempt failed and the hold still stands. */
  lastAttemptFailed: boolean
  /** A checkout was opened for the booking, so a payment may still arrive after the hold. */
  paymentOpened: boolean
}

/** Where the booking this browser made stands: the payment step polls it (docs/16 §5). */
export async function bookingStateAction(raw: unknown): Promise<Answer<BookingState>> {
  const input = RefInput.safeParse(raw)
  if (!input.success) return fail({ code: 'invalid-input', fields: [] })
  const req = await flowRequest()
  const booking = await bookingForThisBrowser(req, input.data.ref)
  if (!booking) return fail({ code: 'not-found' })
  const [lost, latest] = await Promise.all([
    req.payload.count({
      collection: 'refunds',
      where: { and: [{ booking: { equals: booking.id } }, { reason: { equals: 'slotTaken' } }] },
      overrideAccess: true,
      req,
    }),
    req.payload.find({
      collection: 'payments',
      where: { booking: { equals: booking.id } },
      sort: '-updatedAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    }),
  ])
  return {
    ok: true,
    value: {
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      holdExpiresAt: booking.holdExpiresAt ?? null,
      slotLost: lost.totalDocs > 0,
      lastAttemptFailed: latest.docs[0]?.status === 'failed',
      paymentOpened: latest.docs.length > 0,
    },
  }
}

const FakePayInput = z.strictObject({ ref: Reference, outcome: z.enum(['captured', 'failed']) })

/**
 * The fake gateway's checkout, for local development and the end-to-end tests only (docs/16
 * §11; PAYMENT_GATEWAY=fake, which src/lib/env.ts refuses on every Vercel deployment): pays or
 * fails the booking's order in the fake, and posts the webhook Razorpay would send, signed, to
 * the real webhook route, which checks its signature like any other.
 */
export async function fakePayAction(raw: unknown): Promise<Answer<{ sent: boolean }>> {
  const input = FakePayInput.safeParse(raw)
  if (!input.success) return fail({ code: 'invalid-input', fields: [] })
  const config = env()
  const gateway = gatewayFor(config)
  if (config.PAYMENT_GATEWAY !== 'fake' || !gateway.ok || !(gateway.value instanceof FakeGateway)) {
    return fail({ code: 'not-found' })
  }
  const req = await flowRequest()
  const booking = await bookingForThisBrowser(req, input.data.ref)
  if (!booking) return fail({ code: 'not-found' })
  const { docs } = await req.payload.find({
    collection: 'payments',
    where: { and: [{ booking: { equals: booking.id } }, { kind: { equals: 'checkout' } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const orderId = docs[0]?.gatewayOrderId
  if (!orderId || !gateway.value.orders.has(orderId)) return fail({ code: 'not-found' })
  const webhook = gateway.value.pay(orderId, input.data.outcome)
  const answer = await fetch(new URL('/api/webhooks/razorpay', config.siteUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': webhook.signature,
      'x-razorpay-event-id': webhook.eventId,
    },
    body: webhook.rawBody,
  })
  return answer.ok ? { ok: true, value: { sent: true } } : fail({ code: 'failed' })
}

// ---- Manage a booking (F4) ----

const TokenInput = z.strictObject({ token: ManageToken })

export async function manageTimesAction(
  raw: unknown,
): Promise<Answer<{ days: { day: string; starts: string[] }[] }>> {
  const input = TokenInput.safeParse(raw)
  if (!input.success) return fail({ code: 'invalid-input', fields: [] })
  const req = await flowRequest()
  const booking = await findByManageToken(req, input.data.token, new Date())
  if (!booking?.practitioner || !booking.serviceOption) return fail({ code: 'not-found' })
  const listed = await listSlots(req, {
    serviceId: typeof booking.service === 'number' ? booking.service : booking.service.id,
    serviceOption: booking.serviceOption,
    practitionerId:
      typeof booking.practitioner === 'number' ? booking.practitioner : booking.practitioner.id,
  })
  return listed.ok ? { ok: true, value: listed.value } : fail(fromBooking(listed.error))
}

const RescheduleInput = z.strictObject({
  token: ManageToken,
  startsAt: z.iso.datetime({ offset: true }),
})

export async function rescheduleAction(
  raw: unknown,
): Promise<Answer<{ ref: string; startsAt: string | null; manageToken: string | null }>> {
  const input = RescheduleInput.safeParse(raw)
  if (!input.success) return fail({ code: 'invalid-input', fields: [] })
  const req = await flowRequest()
  return inTransaction(
    req,
    async (): Promise<
      Answer<{ ref: string; startsAt: string | null; manageToken: string | null }>
    > => {
      const moved = await reschedule(req, input.data)
      if (!moved.ok) return fail(fromBooking(moved.error))
      // The old booking's payment link would pay for a booking that moved (docs/16 §5).
      const closed = await payments().closeOpenLinks(req, moved.value.booking.id)
      if (!closed.ok) return fail({ code: 'failed' })
      return {
        ok: true,
        value: {
          ref: moved.value.booking.reference,
          startsAt: moved.value.booking.startsAt,
          manageToken: moved.value.manageToken,
        },
      }
    },
    keepOk,
  )
}

const CancelInput = z.strictObject({
  token: ManageToken,
  reason: z.string().trim().max(1000).optional(),
})

/** The refund's amount only while prices are published (D-21); otherwise only that there is one. */
export type Cancelled = {
  refunded: boolean
  refundPaise: number | null
  refundAwaitsOwner: boolean
}

/**
 * Cancels a booking through its manage link, within policy (D-16), and asks for the refund the
 * service's rule gives in the same transaction (src/lib/bookingFlow/clientRefund.ts); a refund
 * approved at once is sent to the gateway once that transaction has committed.
 */
export async function cancelAction(raw: unknown): Promise<Answer<Cancelled>> {
  const input = CancelInput.safeParse(raw)
  if (!input.success) return fail({ code: 'invalid-input', fields: [] })
  const payload = await flowPayload()
  const req = await flowRequest(payload)
  const now = new Date()
  const done = await inTransaction(
    req,
    async (): Promise<
      Answer<{ refundPaise: number; refundAwaitsOwner: boolean; toSend: number[] }>
    > => {
      const cancelled = await cancel(req, input.data, now)
      if (!cancelled.ok) return fail(fromBooking(cancelled.error))
      // No payment link is left to pay for a booking that has ended (docs/16 §5).
      const closed = await payments().closeOpenLinks(req, cancelled.value.booking.id)
      if (!closed.ok) return fail({ code: 'failed' })
      const booking = await loadBooking(req, cancelled.value.booking.id)
      if (!booking) return fail({ code: 'not-found' })
      const refund = await requestClientRefund(req, {
        booking,
        amountPaise: cancelled.value.refundPaise,
      })
      // The rule's refund is what the client is told: when the payments cannot give it all back
      // (an open refund holds part of it), nothing changes and the office takes it from here.
      if (refund.requestedPaise < cancelled.value.refundPaise) {
        return fail({ code: 'not-allowed', reason: 'refund-held' })
      }
      return {
        ok: true,
        value: {
          refundPaise: cancelled.value.refundPaise,
          refundAwaitsOwner: refund.awaitingOwner,
          toSend: refund.toSend,
        },
      }
    },
    keepOk,
  )
  if (!done.ok) return done
  await payments().sendRefunds(payload, done.value.toSend)
  const { pricesPublic } = await readFlags(payload)
  return {
    ok: true,
    value: {
      refunded: done.value.refundPaise > 0,
      refundPaise: pricesPublic ? done.value.refundPaise : null,
      refundAwaitsOwner: done.value.refundAwaitsOwner,
    },
  }
}
