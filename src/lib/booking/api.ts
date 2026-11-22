import 'server-only'

import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import { hasRole, isActive } from '@/access/roles'
import { isIstDay } from '@/fields/istDay'
import type { PriceQuote } from '@/lib/payments/money'
import { err, ok, type Result } from '@/lib/result'
import { readFlags } from '@/lib/settings/source'
import type { Booking } from '@/payload-types'

import { cancelBooking, rescheduleBooking } from './changes'
import { bookWithoutPayment, confirmBooking } from './confirm'
import { inTransaction, keepOk } from './guard'
import { idOf, placeHold, type BookingDetails, type PriceSnapshot } from './holds'
import {
  calendarConnected,
  engineWindow,
  isSlotService,
  loadAvailability,
  loadPractitioner,
  loadRules,
  loadService,
  offers,
  optionOf,
  paidPaiseFor,
} from './load'
import type { BookingError } from './operations'
import { canClientCancel, canClientReschedule } from './policies'
import { generateSlots, istDayOf } from './slots'
import { BOOKING_FOR, BOOKING_FORMATS } from './states'
import { requestTime } from './timeRequests'
import { hashManageToken, isManageToken, manageLinkOpen, newManageToken } from './tokens'

/**
 * The booking module's server functions (docs/16 §6, §12): what the booking flow (wave 2, D) and
 * the office's actions (E) call. Each one validates its input with Zod at the boundary and checks
 * who is asking before it reads anything (CLAUDE.md #6):
 * - a visitor (no sign-in) lists times, books, and asks for a time, for an offered service only;
 *   the flow's own server code passes the person it recorded (after the consents, CLAUDE.md #4)
 *   and the price source, never the browser;
 * - a client opens, moves and cancels their booking with its manage link's token (docs/03 F4);
 * - the office (an owner or operator who has entered the two-factor code) confirms a time
 *   request, and moves or cancels any booking.
 * No answer carries a price, a person's details, a note or a token hash (D-21, CLAUDE.md #3). A
 * manage token is returned once, when it is issued, for the confirmation to carry.
 * Rate limits and Turnstile on the public calls are the route's (docs/08 §6).
 */

export type ApiError =
  BookingError | { code: 'invalid-input'; fields: string[] } | { code: 'forbidden' }

/** What the flow and the manage page may show of a booking: never its price or its person. */
export type BookingSummary = {
  id: number
  reference: string
  type: Booking['type']
  status: Booking['status']
  serviceId: number
  practitionerId: number | null
  format: Booking['format']
  startsAt: string | null
  endsAt: string | null
  holdExpiresAt: string | null
}

export function summarise(booking: Booking): BookingSummary {
  return {
    id: booking.id,
    reference: booking.reference,
    type: booking.type,
    status: booking.status,
    serviceId: idOf(booking.service),
    practitionerId: booking.practitioner ? idOf(booking.practitioner) : null,
    format: booking.format ?? null,
    startsAt: booking.startsAt ?? null,
    endsAt: booking.endsAt ?? null,
    holdExpiresAt: booking.holdExpiresAt ?? null,
  }
}

/**
 * The price in force for a service's option, computed by the payments module on the server
 * (docs/16 §5: price history and the service's GST rate); null when the option has no price.
 */
export type PriceSource = (
  req: PayloadRequest,
  input: { serviceId: number; serviceOption: string; at: Date },
) => Promise<PriceQuote | null>

// ---- Inputs ----

const Id = z.number().int().positive()
const OptionId = z.string().trim().min(1).max(64)
const Instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value))
const Day = z.string().refine(isIstDay, 'A day as YYYY-MM-DD.')
const Token = z.string().refine(isManageToken, 'A manage link’s token.')
/** One checkout's key, made by the flow when step 3 opens: a double submit sends it twice. */
const CheckoutKey = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/)
const Text = (max: number) => z.string().trim().max(max)

const Details = {
  format: z.enum(BOOKING_FORMATS.map((format) => format.value)).optional(),
  whoFor: z.enum(BOOKING_FOR.map((entry) => entry.value)).optional(),
  ageBand: z.enum(['under18', 'adult']).optional(),
  source: Text(100).optional(),
  utm: z
    .strictObject({
      source: Text(200).optional(),
      medium: Text(200).optional(),
      campaign: Text(200).optional(),
      term: Text(200).optional(),
      content: Text(200).optional(),
    })
    .optional(),
  company: z
    .strictObject({
      name: Text(200).optional(),
      role: Text(100).optional(),
      teamSize: Text(50).optional(),
      sector: Text(100).optional(),
    })
    .optional(),
}

export const ListSlotsInput = z.strictObject({
  serviceId: Id,
  serviceOption: OptionId,
  practitionerId: Id,
})

export const BookSlotInput = z.strictObject({
  checkoutKey: CheckoutKey,
  serviceId: Id,
  serviceOption: OptionId,
  practitionerId: Id,
  startsAt: Instant,
  ...Details,
})

export const AskForTimeInput = z.strictObject({
  serviceId: Id,
  serviceOption: OptionId,
  practitionerId: Id.optional(),
  preferredDays: z.array(Day).min(1).max(14),
  preferredTimes: Text(200).optional(),
  note: Text(1000).optional(),
  ...Details,
})

export const ConfirmTimeInput = z.strictObject({
  bookingId: Id,
  startsAt: Instant,
  practitionerId: Id.optional(),
})

export const ManageInput = z.strictObject({ token: Token })

export const RescheduleInput = z.union([
  z.strictObject({ token: Token, startsAt: Instant }),
  z.strictObject({ bookingId: Id, startsAt: Instant }),
])

export const CancelInput = z.union([
  z.strictObject({ token: Token, reason: Text(1000).optional() }),
  z.strictObject({
    bookingId: Id,
    by: z.enum(['client', 'iiic']),
    reason: Text(1000).optional(),
  }),
])

/** The price quote as the booking module takes it: whole paise that add up (CLAUDE.md #5). */
const Quote = z
  .object({
    totalPaise: z.number().int().nonnegative(),
    taxablePaise: z.number().int().nonnegative(),
    taxPaise: z.number().int().nonnegative(),
    rate: z.number().int().min(0).max(10_000),
    sacCode: z.string().nullable(),
  })
  .refine((quote) => quote.taxablePaise + quote.taxPaise === quote.totalPaise)

function parse<T extends z.ZodType>(
  schema: T,
  raw: unknown,
): Result<z.output<T>, { code: 'invalid-input'; fields: string[] }> {
  const parsed = schema.safeParse(raw)
  if (parsed.success) return ok(parsed.data)
  return err({
    code: 'invalid-input',
    fields: [...new Set(parsed.error.issues.map((issue) => issue.path.join('.') || '(input)'))],
  })
}

// ---- Who is asking ----

/** An owner or operator who has entered the two-factor code: the office (docs/05). */
export function isOffice(req: PayloadRequest): boolean {
  const user = req.user as
    ({ collection?: string; _strategy?: string } & Parameters<typeof hasRole>[0]) | null | undefined
  return (
    user?.collection === 'users' &&
    user._strategy === 'totp' &&
    isActive(user) &&
    hasRole(user, 'owner', 'operator')
  )
}

/** The booking a manage link's token opens, while the link still works. */
export async function findByManageToken(
  req: PayloadRequest,
  token: string,
  now: Date,
): Promise<Booking | null> {
  if (!isManageToken(token)) return null
  const { docs } = await req.payload.find({
    collection: 'bookings',
    where: { manageTokenHash: { equals: hashManageToken(token) } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
  })
  const booking = docs[0]
  return booking && manageLinkOpen(booking, now) ? booking : null
}

/** Gives a booking a manage link's token, once; returns it to be sent, or null if it has one. */
async function issueManageToken(req: PayloadRequest, bookingId: number): Promise<string | null> {
  const booking = await req.payload.findByID({
    collection: 'bookings',
    id: bookingId,
    depth: 0,
    showHiddenFields: true,
    overrideAccess: true,
    req,
  })
  if (booking.manageTokenHash) return null
  const { token, hash } = newManageToken()
  await req.payload.update({
    collection: 'bookings',
    id: bookingId,
    data: { manageTokenHash: hash },
    depth: 0,
    overrideAccess: true,
    req,
  })
  return token
}

function detailsOf(input: {
  format?: 'online' | 'office'
  whoFor?: Booking['whoFor']
  ageBand?: Booking['ageBand']
  source?: string
  utm?: Booking['utm']
  company?: Booking['company']
}): BookingDetails {
  return {
    format: input.format,
    whoFor: input.whoFor,
    ageBand: input.ageBand,
    source: input.source,
    utm: input.utm,
    company: input.company,
  }
}

/** What the flow's own server code passes besides the browser's input. */
export type FlowContext = {
  /** The person recorded at step 3, after their consents (CLAUDE.md #4). */
  personId: number
  /** The parent or guardian who booked, when not the client. */
  bookedBy?: number | null
  /** The consents given in the flow, for the written receipt (B3a). */
  consents?: number[]
  /** The payments module's price source. */
  price: PriceSource
  now?: Date
}

/** The price to copy into a booking: sessions only, as calls and info sessions are free (F3). */
async function priceFor(
  req: PayloadRequest,
  type: string,
  input: { serviceId: number; serviceOption: string; at: Date },
  source: PriceSource,
): Promise<Result<PriceSnapshot | null, { code: 'invalid-input'; fields: string[] }>> {
  if (type !== 'session') return ok(null)
  const quote = await source(req, input)
  if (!quote) return ok(null)
  const checked = Quote.safeParse(quote)
  // A quote that does not add up is a fault of the server's, never booked on.
  if (!checked.success) throw new Error('The price quote is not whole paise that add up.')
  return ok({
    totalPaise: checked.data.totalPaise,
    taxPaise: checked.data.taxPaise,
    gstRateBasisPoints: checked.data.rate,
    sacCode: checked.data.sacCode,
  })
}

// ---- The flow ----

/**
 * The free start times for a service's option with one practitioner, by day in India (docs/03
 * F3, step 2). Anyone may ask, for an offered service and an active practitioner who offers it;
 * none are offered until the practitioner's calendar is connected and their hours set (docs/16
 * §7, I-24), or while a booking rule is missing.
 */
export async function listSlots(
  req: PayloadRequest,
  raw: unknown,
  now: Date = new Date(),
): Promise<Result<{ days: { day: string; starts: string[] }[] }, ApiError>> {
  const input = parse(ListSlotsInput, raw)
  if (!input.ok) return input
  const service = await loadService(req, input.value.serviceId)
  if (!isSlotService(service)) return err({ code: 'not-found' })
  const option = optionOf(service, input.value.serviceOption)
  const practitioner = await loadPractitioner(req, input.value.practitionerId)
  if (!option || !practitioner || !offers(practitioner, service.id)) {
    return err({ code: 'not-found' })
  }
  const rules = await loadRules(req, service)
  if (!rules.ok) return err({ code: 'rule-missing' })
  if (!(await calendarConnected(req, practitioner.id))) return ok({ days: [] })
  const availability = await loadAvailability(req, {
    practitionerId: practitioner.id,
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
    days: days.map((day) => ({
      day: day.day,
      starts: day.starts.map((start) => start.toISOString()),
    })),
  })
}

/**
 * Books a time the engine offers (docs/03 F3, end of step 3): with payment at booking on and a
 * priced session, a hold for the payment step (`next: 'pay'`); otherwise confirmed at once
 * (`next: 'confirmed'`), unpaid when priced, as while prices are hidden (D-21, D-24). The same
 * checkout key returns the same booking. A visitor may ask, for an offered service.
 */
export async function bookSlot(
  req: PayloadRequest,
  raw: unknown,
  context: FlowContext,
): Promise<
  Result<
    { booking: BookingSummary; next: 'pay' | 'confirmed'; manageToken: string | null },
    ApiError
  >
> {
  const input = parse(BookSlotInput, raw)
  if (!input.ok) return input
  const now = context.now ?? new Date()
  const service = await loadService(req, input.value.serviceId)
  if (!isSlotService(service)) return err({ code: 'not-found' })
  if (service.format === 'both' && !input.value.format) {
    return err({ code: 'invalid-input', fields: ['format'] })
  }
  const price = await priceFor(
    req,
    service.type,
    { serviceId: service.id, serviceOption: input.value.serviceOption, at: now },
    context.price,
  )
  if (!price.ok) return price
  const flags = await readFlags(req.payload)
  const pay = flags.payAtBooking && (price.value?.totalPaise ?? 0) > 0

  return inTransaction(
    req,
    async () => {
      const placeInput = {
        checkoutKey: input.value.checkoutKey,
        serviceId: service.id,
        serviceOption: input.value.serviceOption,
        practitionerId: input.value.practitionerId,
        startsAt: input.value.startsAt,
        personId: context.personId,
        price: price.value,
        details: {
          ...detailsOf(input.value),
          bookedBy: context.bookedBy ?? null,
          consents: context.consents ?? [],
        },
        now,
      }
      const placed = pay
        ? await placeHold(req, placeInput)
        : await bookWithoutPayment(req, placeInput)
      if (!placed.ok) return placed
      const manageToken = await issueManageToken(req, placed.value.id)
      return ok({
        booking: summarise(placed.value),
        next: placed.value.status === 'confirmed' ? ('confirmed' as const) : ('pay' as const),
        manageToken,
      })
    },
    keepOk,
  )
}

/**
 * Asks for another time (D-02; B12): the preferred days (from today, India time), times and a
 * note. A visitor may ask, for an offered service.
 */
export async function askForTime(
  req: PayloadRequest,
  raw: unknown,
  context: FlowContext,
): Promise<Result<{ booking: BookingSummary; manageToken: string | null }, ApiError>> {
  const input = parse(AskForTimeInput, raw)
  if (!input.ok) return input
  const now = context.now ?? new Date()
  const today = istDayOf(now)
  if (input.value.preferredDays.some((day) => day < today)) {
    return err({ code: 'invalid-input', fields: ['preferredDays'] })
  }
  const service = await loadService(req, input.value.serviceId)
  if (!isSlotService(service)) return err({ code: 'not-found' })
  if (service.format === 'both' && !input.value.format) {
    return err({ code: 'invalid-input', fields: ['format'] })
  }
  const price = await priceFor(
    req,
    service.type,
    { serviceId: service.id, serviceOption: input.value.serviceOption, at: now },
    context.price,
  )
  if (!price.ok) return price
  return inTransaction(
    req,
    async () => {
      const requested = await requestTime(req, {
        serviceId: service.id,
        serviceOption: input.value.serviceOption,
        personId: context.personId,
        practitionerId: input.value.practitionerId ?? null,
        preferredDays: input.value.preferredDays,
        preferredTimes: input.value.preferredTimes,
        note: input.value.note,
        price: price.value,
        details: {
          ...detailsOf(input.value),
          bookedBy: context.bookedBy ?? null,
          consents: context.consents ?? [],
        },
      })
      if (!requested.ok) return requested
      const manageToken = await issueManageToken(req, requested.value.id)
      return ok({ booking: summarise(requested.value), manageToken })
    },
    keepOk,
  )
}

// ---- The manage link and the office ----

/**
 * What the manage page shows (docs/03 F4): the booking, and whether the client may move or
 * cancel it themselves; when not, the page shows how to contact IIIC instead.
 */
export async function viewBooking(
  req: PayloadRequest,
  raw: unknown,
  now: Date = new Date(),
): Promise<
  Result<{ booking: BookingSummary; canReschedule: boolean; canCancel: boolean }, ApiError>
> {
  const input = parse(ManageInput, raw)
  if (!input.ok) return input
  const booking = await findByManageToken(req, input.value.token, now)
  if (!booking) return err({ code: 'not-found' })
  const service = await loadService(req, idOf(booking.service))
  const rules = service ? await loadRules(req, service) : null
  const startsAt = booking.startsAt ? new Date(booking.startsAt) : null
  const canReschedule = Boolean(
    startsAt &&
    rules?.ok &&
    canClientReschedule({
      now,
      startsAt,
      rescheduleWindowHours: rules.value.rescheduleWindowHours,
      status: booking.status,
    }).allowed,
  )
  const canCancel = canClientCancel({
    now,
    startsAt,
    status: booking.status,
    paidPaise: await paidPaiseFor(req, booking),
    steps: rules?.ok ? rules.value.refundSteps : [],
  }).allowed
  return ok({ booking: summarise(booking), canReschedule, canCancel })
}

/**
 * Confirms a time request at the time the office agreed with the client (docs/03 F3; B2). The
 * office only.
 */
export async function confirmTimeRequest(
  req: PayloadRequest,
  raw: unknown,
  now: Date = new Date(),
): Promise<Result<{ booking: BookingSummary }, ApiError>> {
  if (!isOffice(req)) return err({ code: 'forbidden' })
  const input = parse(ConfirmTimeInput, raw)
  if (!input.ok) return input
  const confirmed = await confirmBooking(req, {
    bookingId: input.value.bookingId,
    cause: 'timeAgreed',
    startsAt: input.value.startsAt,
    practitionerId: input.value.practitionerId,
    now,
  })
  return confirmed.ok ? ok({ booking: summarise(confirmed.value) }) : confirmed
}

/**
 * Moves a booking to a new time (F4, B7): the client with the manage link's token, within the
 * reschedule window and to a time the engine offers; or the office, by the booking's id. The new
 * booking gets a new manage token, returned once for the new confirmation.
 */
export async function reschedule(
  req: PayloadRequest,
  raw: unknown,
  now: Date = new Date(),
): Promise<Result<{ booking: BookingSummary; manageToken: string | null }, ApiError>> {
  const input = parse(RescheduleInput, raw)
  if (!input.ok) return input
  let bookingId: number
  let by: 'client' | 'staff'
  if ('token' in input.value) {
    const booking = await findByManageToken(req, input.value.token, now)
    if (!booking) return err({ code: 'not-found' })
    bookingId = booking.id
    by = 'client'
  } else {
    if (!isOffice(req)) return err({ code: 'forbidden' })
    bookingId = input.value.bookingId
    by = 'staff'
  }
  const startsAt = input.value.startsAt
  return inTransaction(
    req,
    async () => {
      const moved = await rescheduleBooking(req, { bookingId, startsAt, by, now })
      if (!moved.ok) return moved
      const manageToken = await issueManageToken(req, moved.value.id)
      return ok({ booking: summarise(moved.value), manageToken })
    },
    keepOk,
  )
}

/**
 * Cancels a booking (F4, B7): the client with the manage link's token, within policy; or the
 * office, by the booking's id, for the client or for IIIC. Answers with the refund the service's
 * rule gives, for the office to request (the payments module's RequestRefund), shown before it
 * is confirmed (docs/05, Refund).
 */
export async function cancel(
  req: PayloadRequest,
  raw: unknown,
  now: Date = new Date(),
): Promise<Result<{ booking: BookingSummary; refundPaise: number }, ApiError>> {
  const input = parse(CancelInput, raw)
  if (!input.ok) return input
  if ('token' in input.value) {
    const booking = await findByManageToken(req, input.value.token, now)
    if (!booking) return err({ code: 'not-found' })
    const cancelled = await cancelBooking(req, {
      bookingId: booking.id,
      by: 'client',
      reason: input.value.reason,
      asker: 'client',
      now,
    })
    return cancelled.ok
      ? ok({
          booking: summarise(cancelled.value.booking),
          refundPaise: cancelled.value.refundPaise,
        })
      : cancelled
  }
  if (!isOffice(req)) return err({ code: 'forbidden' })
  const cancelled = await cancelBooking(req, {
    bookingId: input.value.bookingId,
    by: input.value.by,
    reason: input.value.reason,
    asker: 'staff',
    now,
  })
  return cancelled.ok
    ? ok({ booking: summarise(cancelled.value.booking), refundPaise: cancelled.value.refundPaise })
    : cancelled
}
