import 'server-only'

import { addMinutes } from 'date-fns'
import type { PayloadRequest } from 'payload'

import { err, ok, type Result } from '@/lib/result'
import type { Booking } from '@/payload-types'

import { emit } from './emit'
import { guarded, inTransaction, keepOk, lockBooking, lockPractitioner } from './guard'
import { checkOffered, idOf } from './holds'
import { loadBooking, loadRules, loadService, paidPaiseFor } from './load'
import type { BookingError, CancelBooking, RescheduleBooking } from './operations'
import { canClientCancel, canClientReschedule, canMove, refundForCancellation } from './policies'
import { createBooking, type NewBooking } from './write'

/**
 * Moving and cancelling a booking (docs/03 F4; B7; D-16), by the client through the manage link
 * or by the office. The client's changes follow the policies (src/lib/booking/policies.ts): while
 * the reschedule window or the refund steps are unset, a client is sent to IIIC instead. The
 * office's are not limited by the window; a time it moves a booking to is checked by the guard.
 */

type RescheduleInput = Parameters<RescheduleBooking>[1] & { now?: Date }

/** The fields a rescheduled booking carries over to the new one (everything but its time). */
function carried(booking: Booking): NewBooking {
  return {
    type: booking.type,
    status: 'confirmed',
    paymentStatus: booking.paymentStatus,
    service: idOf(booking.service),
    serviceOption: booking.serviceOption ?? null,
    optionLabel: booking.optionLabel ?? null,
    durationMinutes: booking.durationMinutes ?? null,
    practitioner: booking.practitioner ? idOf(booking.practitioner) : null,
    event: booking.event ? idOf(booking.event) : null,
    person: idOf(booking.person),
    bookedBy: booking.bookedBy ? idOf(booking.bookedBy) : null,
    whoFor: booking.whoFor ?? null,
    ageBand: booking.ageBand ?? null,
    format: booking.format ?? null,
    price: booking.price,
    consents: (booking.consents ?? []).map((consent) => idOf(consent)),
    source: booking.source ?? null,
    utm: booking.utm,
    company: booking.company,
    rescheduledFrom: booking.id,
  }
}

/**
 * RescheduleBooking (F4, B7): a new booking at the new time, linked back by `rescheduledFrom`,
 * and the old one moved to `rescheduled`, in one step under the guard: if the new time is taken,
 * neither changes. A client's new time must be one the engine offers (their own booking's time
 * counts as free); the office's only has to be free and ahead. The payment stays on the first
 * booking (the payments module follows `rescheduledFrom`). Emits `booking.rescheduled`.
 */
export const rescheduleBooking = (
  req: PayloadRequest,
  input: RescheduleInput,
): Promise<Result<Booking, BookingError>> =>
  inTransaction(
    req,
    async (): Promise<Result<Booking, BookingError>> => {
      const now = input.now ?? new Date()
      if (!(await lockBooking(req, input.bookingId))) return err({ code: 'not-found' })
      const booking = await loadBooking(req, input.bookingId)
      if (!booking) return err({ code: 'not-found' })
      if (!canMove(booking.status, 'rescheduled')) {
        return err({ code: 'not-allowed', reason: 'not-active' })
      }
      const service = await loadService(req, idOf(booking.service))
      if (!service || !booking.startsAt || !booking.durationMinutes || !booking.practitioner) {
        return err({ code: 'not-found' })
      }
      const practitionerId = idOf(booking.practitioner)
      if (input.startsAt <= now) return err({ code: 'outside-hours' })

      if (input.by === 'client') {
        const rules = await loadRules(req, service)
        if (!rules.ok) return err({ code: 'rule-missing' })
        const may = canClientReschedule({
          now,
          startsAt: new Date(booking.startsAt),
          rescheduleWindowHours: rules.value.rescheduleWindowHours,
          status: booking.status,
        })
        if (!may.allowed) return err({ code: 'not-allowed', reason: may.reason })
        await lockPractitioner(req, practitionerId)
        const refused = await checkOffered(req, {
          practitionerId,
          startsAt: input.startsAt,
          durationMinutes: booking.durationMinutes,
          rules: rules.value,
          now,
          except: booking.id,
        })
        if (refused) return err(refused)
      } else {
        await lockPractitioner(req, practitionerId)
      }

      const moved = await guarded(req, async () => {
        await req.payload.update({
          collection: 'bookings',
          id: booking.id,
          data: { status: 'rescheduled' },
          depth: 0,
          overrideAccess: true,
          req,
        })
        const created = await createBooking(req, {
          ...carried(booking),
          startsAt: input.startsAt.toISOString(),
          endsAt: addMinutes(input.startsAt, booking.durationMinutes as number).toISOString(),
          confirmedAt: now.toISOString(),
        })
        // A refusal inside must undo the old booking's move too: throw to the outer savepoint.
        if (!created.ok) throw new SlotTaken()
        return created.value
      }).catch((error: unknown) => {
        if (error instanceof SlotTaken) return err({ code: 'slot-taken' } as const)
        throw error
      })
      if (!moved.ok) return moved
      await emit(req, {
        name: 'booking.rescheduled',
        bookingId: moved.value.id,
        fromBookingId: booking.id,
      })
      return ok(moved.value)
    },
    keepOk,
  )

/** The guard's refusal of the new booking, carried out of the reschedule's own savepoint. */
class SlotTaken extends Error {
  constructor() {
    super('slot-taken')
    this.name = 'SlotTaken'
  }
}

type CancelInput = Parameters<CancelBooking>[1] & {
  /** Who is acting: the client through the manage link, or the office for either side. */
  asker?: 'client' | 'staff'
  now?: Date
}

/**
 * CancelBooking (F4, B7): the booking moves to `cancelledByClient` or `cancelledByIiic`, freeing
 * its time, and the refund its service's rule gives is worked out (in full when IIIC cancels).
 * The refund itself is the payments module's (RequestRefund). A client cancels only within
 * policy (canClientCancel). Emits `booking.cancelled`.
 */
export const cancelBooking = (
  req: PayloadRequest,
  input: CancelInput,
): Promise<Result<{ booking: Booking; refundPaise: number }, BookingError>> =>
  inTransaction(
    req,
    async (): Promise<Result<{ booking: Booking; refundPaise: number }, BookingError>> => {
      const now = input.now ?? new Date()
      if (!(await lockBooking(req, input.bookingId))) return err({ code: 'not-found' })
      const booking = await loadBooking(req, input.bookingId)
      if (!booking) return err({ code: 'not-found' })
      const target = input.by === 'iiic' ? 'cancelledByIiic' : 'cancelledByClient'
      if (!canMove(booking.status, target)) {
        return err({ code: 'bad-move', from: booking.status, to: target })
      }
      const service = await loadService(req, idOf(booking.service))
      if (!service) return err({ code: 'not-found' })
      const rules = await loadRules(req, service)
      const steps = rules.ok ? rules.value.refundSteps : []
      const startsAt = booking.startsAt ? new Date(booking.startsAt) : null
      const paidPaise = await paidPaiseFor(req, booking)

      if ((input.asker ?? 'client') === 'client') {
        if (input.by !== 'client') return err({ code: 'not-allowed', reason: 'no-policy' })
        const may = canClientCancel({ now, startsAt, status: booking.status, paidPaise, steps })
        if (!may.allowed) return err({ code: 'not-allowed', reason: may.reason })
      }

      const { refundPaise } = refundForCancellation({
        now,
        startsAt: startsAt ?? now,
        paidPaise,
        steps,
        by: input.by,
      })
      const cancelled = await req.payload.update({
        collection: 'bookings',
        id: booking.id,
        data: {
          status: target,
          holdExpiresAt: null,
          cancellation: { at: now.toISOString(), reason: input.reason ?? null },
        },
        depth: 0,
        overrideAccess: true,
        req,
      })
      await emit(req, { name: 'booking.cancelled', bookingId: booking.id, by: input.by })
      return ok({ booking: cancelled, refundPaise })
    },
    keepOk,
  )
