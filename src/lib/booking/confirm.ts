import 'server-only'

import { addMinutes } from 'date-fns'
import type { PayloadRequest } from 'payload'

import { err, ok, type Result } from '@/lib/result'
import type { Booking } from '@/payload-types'

import { emit } from './emit'
import { inTransaction, keepOk, lockBooking } from './guard'
import { placeBooking, type PlaceInput } from './holds'
import { loadBooking, loadPractitioner, offers } from './load'
import type { BookingError, ConfirmBooking } from './operations'
import { canMove } from './policies'
import type { NewBooking } from './write'
import { updateBooking } from './write'

/**
 * Into `confirmed` (B2; docs/16 §3, §5): ConfirmBooking is the one way an existing booking gets
 * there, and BookWithoutPayment makes one there at once. Each move into `confirmed` is written
 * under the double-booking guard, so when two people's payments race for one time exactly one
 * commits and the other gets `slot-taken`, which the payments module turns into a full refund
 * (B10) in the same transaction (src/lib/booking/guard.ts keeps it usable).
 *
 * Who may confirm what, by cause:
 * - `paymentCaptured`: a hold waiting for payment, or one that lapsed (a late payment confirms it
 *   while the time is still free). Only the payments module, from a verified gateway event or a
 *   server-side check of the order (CLAUDE.md #5), asks for this.
 * - `timeAgreed` or `staff`: a time request, with the time the office agreed (and the
 *   practitioner, when the request named none); the guard checks it, the engine does not, as the
 *   office may agree a time outside the usual hours.
 * - `noPaymentAtBooking`: only through BookWithoutPayment, which creates the booking confirmed.
 */

type ConfirmInput = Parameters<ConfirmBooking>[1] & {
  /** For a time request that named no practitioner: whose time it takes. */
  practitionerId?: number
  now?: Date
}

const idOf = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : (value as { id?: number } | null)?.id

export const confirmBooking = (
  req: PayloadRequest,
  input: ConfirmInput,
): Promise<Result<Booking, BookingError>> =>
  inTransaction(
    req,
    async (): Promise<Result<Booking, BookingError>> => {
      const now = input.now ?? new Date()
      if (!(await lockBooking(req, input.bookingId))) return err({ code: 'not-found' })
      const booking = await loadBooking(req, input.bookingId)
      if (!booking) return err({ code: 'not-found' })
      // Confirming twice changes nothing and emits nothing (a replayed step).
      if (booking.status === 'confirmed') return ok(booking)
      const refuse = err({ code: 'bad-move', from: booking.status, to: 'confirmed' } as const)
      if (!canMove(booking.status, 'confirmed')) return refuse

      const data: Partial<NewBooking> = {
        status: 'confirmed',
        confirmedAt: now.toISOString(),
        holdExpiresAt: null,
      }
      if (booking.status === 'requested') {
        if (input.cause !== 'timeAgreed' && input.cause !== 'staff') return refuse
        if (!input.startsAt || !booking.durationMinutes) return refuse
        if (input.startsAt <= now) return err({ code: 'outside-hours' })
        const practitionerId = input.practitionerId ?? idOf(booking.practitioner)
        const practitioner =
          practitionerId === undefined ? null : await loadPractitioner(req, practitionerId)
        if (!practitioner || !offers(practitioner, idOf(booking.service) as number)) {
          return err({ code: 'not-found' })
        }
        data.practitioner = practitioner.id
        data.startsAt = input.startsAt.toISOString()
        data.endsAt = addMinutes(input.startsAt, booking.durationMinutes).toISOString()
      } else if (input.cause !== 'paymentCaptured') {
        // A hold becomes a booking only on a captured payment (CLAUDE.md #5).
        return refuse
      }

      const confirmed = await updateBooking(req, booking.id, data)
      if (!confirmed.ok) return confirmed
      await emit(req, { name: 'booking.confirmed', bookingId: booking.id, cause: input.cause })
      return confirmed
    },
    keepOk,
  )

/**
 * BookWithoutPayment (D-24; docs/16 §8): a booking confirmed at once, for a time the engine
 * offers, when no payment is taken at booking: prices hidden, payment at booking off, or a free
 * option. `unpaid` when the option has a price (staff may send a payment link), `notRequired`
 * when it is free. Emits `booking.confirmed` with the cause `noPaymentAtBooking`.
 */
export const bookWithoutPayment = (req: PayloadRequest, input: PlaceInput) =>
  placeBooking(req, input, 'confirm')
