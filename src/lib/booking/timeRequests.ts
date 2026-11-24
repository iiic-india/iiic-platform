import 'server-only'

import type { PayloadRequest } from 'payload'

import { isIstDay } from '@/fields/istDay'
import { err, ok, type Result } from '@/lib/result'
import type { Booking } from '@/payload-types'

import { emit } from './emit'
import { inTransaction, keepOk } from './guard'
import { detailsData, formatFor, priceData, type BookingDetails, type PriceSnapshot } from './holds'
import { isSlotService, loadPractitioner, loadService, offers, optionOf } from './load'
import type { BookingError, RequestTime } from './operations'
import { createBooking } from './write'

/**
 * Time requests (D-02; docs/03 F3, "Request another time"; B12): when none of the offered times
 * suits, the client asks for another with the days and times they prefer and a note. It is a
 * booking in `requested` with no time, so it blocks nothing; the office agrees a time with them
 * and confirms it (ConfirmBooking, cause `timeAgreed`), which the double-booking guard checks.
 * The note is the client's own words about when they can come, read by the office only; it never
 * reaches a log, an event or a calendar (CLAUDE.md #3).
 */

export type TimeRequestInput = Parameters<RequestTime>[1] & {
  /** The practitioner the client was looking at, when they chose one. */
  practitionerId?: number | null
  price?: PriceSnapshot | null
  details?: BookingDetails
}

/** The preferred days as a sorted list without repeats; anything not a real day is dropped. */
export function preferredDaysOf(days: readonly string[]): string[] {
  return [...new Set(days.filter((day) => isIstDay(day)))].sort()
}

export const requestTime = (
  req: PayloadRequest,
  input: TimeRequestInput,
): Promise<Result<Booking, BookingError>> =>
  inTransaction(
    req,
    async (): Promise<Result<Booking, BookingError>> => {
      const service = await loadService(req, input.serviceId)
      if (!isSlotService(service)) return err({ code: 'not-found' })
      const option = optionOf(service, input.serviceOption)
      if (!option) return err({ code: 'not-found' })
      let practitionerId: number | null = null
      if (input.practitionerId !== undefined && input.practitionerId !== null) {
        const practitioner = await loadPractitioner(req, input.practitionerId)
        if (!offers(practitioner, service.id)) return err({ code: 'not-found' })
        practitionerId = input.practitionerId
      }
      const created = await createBooking(req, {
        ...detailsData(input.details),
        ...priceData(input.price),
        type: service.type,
        status: 'requested',
        paymentStatus: (input.price?.totalPaise ?? 0) > 0 ? 'unpaid' : 'notRequired',
        service: service.id,
        serviceOption: option.id,
        optionLabel: option.label,
        durationMinutes: option.durationMinutes,
        practitioner: practitionerId,
        person: input.personId,
        format: formatFor(service, input.details?.format),
        timeRequest: {
          preferredDays: preferredDaysOf(input.preferredDays).map((day) => ({ day })),
          preferredTimes: input.preferredTimes ?? null,
          note: input.note ?? null,
        },
      })
      // A booking with no time cannot meet the guard; a refusal here would be a fault.
      if (!created.ok) return created
      await emit(req, { name: 'booking.requested', bookingId: created.value.id })
      return ok(created.value)
    },
    keepOk,
  )
