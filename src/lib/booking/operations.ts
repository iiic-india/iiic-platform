import type { PayloadRequest } from 'payload'

import type { Result } from '@/lib/result'
import type { Booking } from '@/payload-types'

import type { IstDay } from './types'

/**
 * The booking operations other modules call (docs/16 §6), as contracts: the booking builder
 * implements each in src/lib/booking/ on the server ('server-only'), inside the request's
 * transaction, with the inputs checked by Zod at the route that receives them. Every one is
 * idempotent where docs/16 says so, and none logs a name, a contact detail or a note.
 */

/** Why a booking operation said no. Each code is a plain answer the flow can explain. */
export type BookingError =
  | { code: 'slot-taken' } // the database's exclusion constraint refused it (docs/16 §4)
  | { code: 'outside-hours' } // not a time the slot engine offers
  | { code: 'hold-expired' }
  | { code: 'not-allowed'; reason: 'started' | 'outside-window' | 'no-policy' | 'not-active' }
  | { code: 'bad-move'; from: string; to: string } // not in BOOKING_MOVES
  | { code: 'rule-missing' } // a booking rule neither the service nor Settings sets
  | { code: 'not-found' }

/**
 * Places a hold when the client enters payment (B1; docs/03 F3 "Slot hold"): a booking in
 * `held` with `holdExpiresAt` = now + hold minutes, after first moving any expired hold that
 * overlaps it to `expired` in the same transaction. The same `checkoutKey` returns the same
 * booking (a double submit). `slot-taken` when the constraint refuses it.
 */
export type PlaceHold = (
  req: PayloadRequest,
  input: {
    checkoutKey: string
    serviceId: number
    serviceOption: string
    practitionerId: number
    startsAt: Date
    personId: number
  },
) => Promise<Result<Booking, BookingError>>

/**
 * Confirms a booking (B2) and is the one way into `confirmed`: from a hold or `pendingPayment`
 * once the payment is captured, from `expired` when a late payment arrives and the slot is still
 * free, from `requested` once the office sets the agreed time, or at once for a booking that
 * takes no payment at booking (D-24). `slot-taken` means the payment must be refunded (B10).
 * Emits `booking.confirmed`.
 */
export type ConfirmBooking = (
  req: PayloadRequest,
  input: {
    bookingId: number
    cause: 'paymentCaptured' | 'noPaymentAtBooking' | 'timeAgreed' | 'staff'
    /** For a time request: the agreed time, which the constraint checks. */
    startsAt?: Date
  },
) => Promise<Result<Booking, BookingError>>

/** Moves holds past their time to `expired` (B4, and lazily before any hold); returns how many. */
export type ExpireHolds = (req: PayloadRequest, now: Date) => Promise<number>

/**
 * Records a time request (D-02, B12): a booking in `requested` with the preferred days, times
 * and note, and no time. The note is the client's own words about when they can come, read by
 * the office only.
 */
export type RequestTime = (
  req: PayloadRequest,
  input: {
    serviceId: number
    serviceOption: string
    personId: number
    preferredDays: readonly IstDay[]
    preferredTimes?: string
    note?: string
  },
) => Promise<Result<Booking, BookingError>>

/**
 * Moves a confirmed booking (F4, B7): a new booking at the new time, linked by `rescheduledFrom`,
 * and the old one to `rescheduled`, in one transaction. Emits `booking.rescheduled`.
 */
export type RescheduleBooking = (
  req: PayloadRequest,
  input: { bookingId: number; startsAt: Date; by: 'client' | 'staff' },
) => Promise<Result<Booking, BookingError>>

/**
 * Cancels a booking (F4, B7) and works out the refund its service's rule gives; the refund
 * itself is the payments module's (RequestRefund). Emits `booking.cancelled`.
 */
export type CancelBooking = (
  req: PayloadRequest,
  input: { bookingId: number; by: 'client' | 'iiic'; reason?: string },
) => Promise<Result<{ booking: Booking; refundPaise: number }, BookingError>>
