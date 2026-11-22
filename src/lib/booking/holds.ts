import 'server-only'

import { addMinutes } from 'date-fns'
import type { PayloadRequest } from 'payload'

import { err, ok, type Result } from '@/lib/result'
import type { Booking, Service } from '@/payload-types'

import { emit } from './emit'
import { inTransaction, isUniqueOn, keepOk, lockBooking, lockPractitioner } from './guard'
import {
  calendarConnected,
  engineWindow,
  HOLD_STATUSES,
  isSlotService,
  loadAvailability,
  loadBooking,
  loadPractitioner,
  loadRules,
  loadService,
  offers,
  optionOf,
} from './load'
import type { BookingError, PlaceHold } from './operations'
import { canMove } from './policies'
import { generateSlots, isOffered } from './slots'
import type { BookingRules } from './types'
import { createBooking, updateBooking, type NewBooking } from './write'

/**
 * Holds (docs/16 §3; docs/03 F3, "Slot hold"; B1, B4). A hold is a booking in `held` or
 * `pendingPayment` with `holdExpiresAt`: placed when the client enters payment, for the hold
 * minutes the service or Settings give; turned into a confirmed booking only by a captured payment
 * (src/lib/booking/confirm.ts); lapsed into `expired` by the B4 sweep, or before any new hold for
 * the same practitioner. An expired hold no longer takes the time, and a late payment confirms it
 * only while the time is still free.
 */

/** The price copied into a booking when it is made (docs/16 §5), computed by the payments module. */
export type PriceSnapshot = {
  totalPaise: number
  taxPaise: number
  gstRateBasisPoints: number | null
  sacCode: string | null
}

/** What the flow gathered at step 3 besides the time (docs/03 F3), set by the server. */
export type BookingDetails = {
  format?: 'online' | 'office' | null
  whoFor?: Booking['whoFor']
  ageBand?: Booking['ageBand']
  bookedBy?: number | null
  consents?: number[]
  source?: string | null
  utm?: Booking['utm']
  company?: Booking['company']
}

export type PlaceInput = Parameters<PlaceHold>[1] & {
  price?: PriceSnapshot | null
  details?: BookingDetails
  /** The moment of asking; the server's clock when left out. */
  now?: Date
}

/** Where the session takes place: the service's format, or the client's choice when it offers both. */
export function formatFor(
  service: Service,
  chosen: BookingDetails['format'],
): 'online' | 'office' | null {
  if (service.format === 'both') return chosen ?? null
  return service.format
}

/** The booking fields the flow's details fill in. */
export function detailsData(details: BookingDetails | undefined): Partial<NewBooking> {
  if (!details) return {}
  const { format: _format, ...rest } = details
  return Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  ) as Partial<NewBooking>
}

export function priceData(price: PriceSnapshot | null | undefined): Partial<NewBooking> {
  return price
    ? {
        price: {
          totalPaise: price.totalPaise,
          taxPaise: price.taxPaise,
          gstRateBasisPoints: price.gstRateBasisPoints,
          sacCode: price.sacCode,
        },
      }
    : {}
}

/**
 * Whether the engine offers a start for a practitioner now; else why not: `slot-taken` when the
 * time is in their hours but someone or something has it, `outside-hours` when it is not a start
 * the engine would offer at all (or no calendar is connected yet, docs/16 §7).
 */
export async function checkOffered(
  req: PayloadRequest,
  input: {
    practitionerId: number
    startsAt: Date
    durationMinutes: number
    rules: BookingRules
    now: Date
    except?: number
  },
): Promise<BookingError | null> {
  if (!(await calendarConnected(req, input.practitionerId))) return { code: 'outside-hours' }
  const availability = await loadAvailability(req, {
    practitionerId: input.practitionerId,
    window: engineWindow(input.now, input.rules.horizonDays),
    now: input.now,
    except: input.except,
  })
  const base = {
    now: input.now,
    durationMinutes: input.durationMinutes,
    rules: input.rules,
    hours: availability.hours,
    exceptions: availability.exceptions,
  }
  const taken = [...availability.busy, ...availability.booked]
  if (isOffered(generateSlots({ ...base, taken }), input.startsAt)) return null
  return isOffered(generateSlots({ ...base, taken: [] }), input.startsAt)
    ? { code: 'slot-taken' }
    : { code: 'outside-hours' }
}

/**
 * Moves the holds past their time to `expired`, each under its row lock so that a payment
 * confirming it at the same moment wins or loses cleanly; emits `booking.holdExpired` for each
 * (B4). With a practitioner, only theirs. Joins the request's transaction.
 */
export async function expireLapsedHolds(
  req: PayloadRequest,
  now: Date,
  practitionerId?: number,
): Promise<number> {
  const { docs } = await req.payload.find({
    collection: 'bookings',
    where: {
      and: [
        { status: { in: [...HOLD_STATUSES] } },
        { holdExpiresAt: { less_than_equal: now.toISOString() } },
        ...(practitionerId === undefined ? [] : [{ practitioner: { equals: practitionerId } }]),
      ],
    },
    depth: 0,
    pagination: false,
    select: { status: true },
    overrideAccess: true,
    req,
  })
  let expired = 0
  for (const { id } of docs) {
    await lockBooking(req, id)
    const booking = await loadBooking(req, id)
    if (
      !booking ||
      !(HOLD_STATUSES as readonly string[]).includes(booking.status) ||
      !booking.holdExpiresAt ||
      new Date(booking.holdExpiresAt) > now
    ) {
      continue
    }
    await req.payload.update({
      collection: 'bookings',
      id,
      data: { status: 'expired' },
      depth: 0,
      overrideAccess: true,
      req,
    })
    await emit(req, { name: 'booking.holdExpired', bookingId: id })
    expired += 1
  }
  return expired
}

/** ExpireHolds (B4): moves every hold past its time to `expired`; returns how many. */
export async function expireHolds(req: PayloadRequest, now: Date): Promise<number> {
  return inTransaction(req, () => expireLapsedHolds(req, now))
}

/**
 * Places a booking on a practitioner's time: as a hold (`held`, for payment at booking) or
 * confirmed at once (no payment at booking, D-24). Shared by PlaceHold and BookWithoutPayment
 * (src/lib/booking/confirm.ts). In one transaction: the practitioner's lock, the same checkout
 * key's booking if there is one (a double submit), the lapsed holds expired, the time checked
 * against the engine, and the booking written under the guard.
 */
export async function placeBooking(
  req: PayloadRequest,
  input: PlaceInput,
  mode: 'hold' | 'confirm',
): Promise<Result<Booking, BookingError>> {
  const now = input.now ?? new Date()
  return inTransaction(
    req,
    async (): Promise<Result<Booking, BookingError>> => {
      const service = await loadService(req, input.serviceId)
      if (!isSlotService(service)) return err({ code: 'not-found' })
      const option = optionOf(service, input.serviceOption)
      const practitioner = await loadPractitioner(req, input.practitionerId)
      if (!option || !practitioner || !offers(practitioner, service.id)) {
        return err({ code: 'not-found' })
      }
      const rules = await loadRules(req, service)
      if (!rules.ok) return err({ code: 'rule-missing' })

      await lockPractitioner(req, practitioner.id)
      const again = await findByCheckoutKey(req, input.checkoutKey)
      if (again) return ok(again)
      await expireLapsedHolds(req, now, practitioner.id)

      const refused = await checkOffered(req, {
        practitionerId: practitioner.id,
        startsAt: input.startsAt,
        durationMinutes: option.durationMinutes,
        rules: rules.value,
        now,
      })
      if (refused) return err(refused)

      const priced = (input.price?.totalPaise ?? 0) > 0
      const data: NewBooking = {
        ...detailsData(input.details),
        ...priceData(input.price),
        type: service.type,
        status: mode === 'hold' ? 'held' : 'confirmed',
        paymentStatus: mode === 'hold' || priced ? 'unpaid' : 'notRequired',
        service: service.id,
        serviceOption: option.id,
        optionLabel: option.label,
        durationMinutes: option.durationMinutes,
        practitioner: practitioner.id,
        person: input.personId,
        format: formatFor(service, input.details?.format),
        startsAt: input.startsAt.toISOString(),
        endsAt: addMinutes(input.startsAt, option.durationMinutes).toISOString(),
        holdExpiresAt:
          mode === 'hold' ? addMinutes(now, rules.value.holdMinutes).toISOString() : null,
        confirmedAt: mode === 'confirm' ? now.toISOString() : null,
        checkoutKey: input.checkoutKey,
      }
      let created: Result<Booking, { code: 'slot-taken' }>
      try {
        created = await createBooking(req, data)
      } catch (error) {
        // The same checkout submitted twice at once: the first one's booking is the answer.
        const first = isUniqueOn(error, 'checkoutKey')
          ? await findByCheckoutKey(req, input.checkoutKey)
          : null
        if (first) return ok(first)
        throw error
      }
      if (!created.ok) return created
      await emit(
        req,
        mode === 'hold'
          ? { name: 'booking.held', bookingId: created.value.id }
          : { name: 'booking.confirmed', bookingId: created.value.id, cause: 'noPaymentAtBooking' },
      )
      return created
    },
    keepOk,
  )
}

/** The booking a checkout key already made, if any (a double submit finds it). */
export async function findByCheckoutKey(
  req: PayloadRequest,
  checkoutKey: string,
): Promise<Booking | null> {
  const { docs } = await req.payload.find({
    collection: 'bookings',
    where: { checkoutKey: { equals: checkoutKey } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
  })
  return docs[0] ?? null
}

/**
 * PlaceHold (B1): a booking in `held` until now + the hold minutes. The same checkout key
 * returns the same booking; `slot-taken` when someone has the time; `outside-hours` when it is
 * not a time the engine offers. Emits `booking.held`.
 */
export const placeHold = (req: PayloadRequest, input: PlaceInput) =>
  placeBooking(req, input, 'hold')

/**
 * Moves a hold to `pendingPayment` as checkout opens (docs/16 §5), for the payments module.
 * The hold keeps its end: the timer the client sees never resets (docs/08 §5).
 */
export async function startPayment(
  req: PayloadRequest,
  input: { bookingId: number; now?: Date },
): Promise<Result<Booking, BookingError>> {
  const now = input.now ?? new Date()
  return inTransaction(
    req,
    async (): Promise<Result<Booking, BookingError>> => {
      if (!(await lockBooking(req, input.bookingId))) return err({ code: 'not-found' })
      const booking = await loadBooking(req, input.bookingId)
      if (!booking) return err({ code: 'not-found' })
      if (booking.status === 'pendingPayment') return ok(booking)
      if (!canMove(booking.status, 'pendingPayment')) {
        return err({ code: 'bad-move', from: booking.status, to: 'pendingPayment' })
      }
      if (!booking.holdExpiresAt || new Date(booking.holdExpiresAt) <= now) {
        return err({ code: 'hold-expired' })
      }
      return updateBooking(req, booking.id, { status: 'pendingPayment' })
    },
    keepOk,
  )
}

/**
 * Keeps a hold for one more try when the gateway could not be reached (docs/03 F3, edge cases:
 * "keep the hold for one retry"): its end moves to now + the hold minutes, once. A hold already
 * kept once, or already past its time, is not kept again.
 */
export async function extendHold(
  req: PayloadRequest,
  input: { bookingId: number; now?: Date },
): Promise<Result<Booking, BookingError>> {
  const now = input.now ?? new Date()
  return inTransaction(
    req,
    async (): Promise<Result<Booking, BookingError>> => {
      if (!(await lockBooking(req, input.bookingId))) return err({ code: 'not-found' })
      const booking = await loadBooking(req, input.bookingId)
      if (!booking) return err({ code: 'not-found' })
      if (!(HOLD_STATUSES as readonly string[]).includes(booking.status)) {
        return err({ code: 'not-allowed', reason: 'not-active' })
      }
      if (!booking.holdExpiresAt || new Date(booking.holdExpiresAt) <= now) {
        return err({ code: 'hold-expired' })
      }
      const service = await loadService(req, idOf(booking.service))
      const rules = service ? await loadRules(req, service) : null
      if (!rules?.ok) return err({ code: 'rule-missing' })
      const placed = new Date(booking.createdAt)
      const firstEnd = addMinutes(placed, rules.value.holdMinutes)
      if (new Date(booking.holdExpiresAt) > firstEnd) {
        return err({ code: 'not-allowed', reason: 'outside-window' })
      }
      return updateBooking(req, booking.id, {
        holdExpiresAt: addMinutes(now, rules.value.holdMinutes).toISOString(),
      })
    },
    keepOk,
  )
}

export const idOf = (value: number | { id: number }): number =>
  typeof value === 'number' ? value : value.id
