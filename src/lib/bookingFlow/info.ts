import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { PayloadRequest } from 'payload'

import type { BookingSummary } from '@/lib/booking/api'
import { summarise } from '@/lib/booking/api'
import { emit } from '@/lib/booking/emit'
import { inTransaction, keepOk } from '@/lib/booking/guard'
import { newManageToken } from '@/lib/booking/tokens'
import { createBooking } from '@/lib/booking/write'
import { err, ok, type Result } from '@/lib/result'
import { execute } from '@/lib/payments/store'

/**
 * A place at an info session (docs/03 F3, `info`; F6): a fixed-time session with a capacity, free,
 * so the booking is confirmed at once (`notRequired`). The event's row is locked while the places
 * are counted, so two people taking the last place are served in turn (docs/16 §4). No
 * practitioner is set on the booking, so the double-booking guard, which keeps one person's time,
 * leaves the session's many places alone. Emits `booking.confirmed` (B2).
 */

const SERVER = { overrideAccess: true, depth: 0 } as const

export type InfoError =
  { code: 'not-found' } | { code: 'full' } | { code: 'slot-taken' } | { code: 'started' }

export async function bookInfoSession(
  req: PayloadRequest,
  input: {
    eventId: number
    checkoutKey: string
    personId: number
    consents: number[]
    now: Date
  },
): Promise<Result<{ booking: BookingSummary; manageToken: string | null }, InfoError>> {
  return inTransaction(
    req,
    async (): Promise<
      Result<{ booking: BookingSummary; manageToken: string | null }, InfoError>
    > => {
      const locked = await execute(
        req,
        sql`SELECT "id" FROM "events" WHERE "id" = ${input.eventId} FOR UPDATE`,
      )
      if (locked.length !== 1) return err({ code: 'not-found' })
      const event = await req.payload.findByID({
        collection: 'events',
        id: input.eventId,
        req,
        disableErrors: true,
        ...SERVER,
      })
      const serviceId =
        typeof event?.service === 'number' ? event.service : (event?.service?.id ?? null)
      if (!event || !event.active || event.kind !== 'infoSession' || serviceId === null) {
        return err({ code: 'not-found' })
      }
      if (new Date(event.startsAt) <= input.now) return err({ code: 'started' })

      const { docs: again } = await req.payload.find({
        collection: 'bookings',
        where: { checkoutKey: { equals: input.checkoutKey } },
        limit: 1,
        req,
        ...SERVER,
      })
      if (again[0]) return ok({ booking: summarise(again[0]), manageToken: null })

      if (typeof event.capacity === 'number') {
        const { totalDocs } = await req.payload.count({
          collection: 'bookings',
          where: { and: [{ event: { equals: event.id } }, { status: { equals: 'confirmed' } }] },
          req,
          overrideAccess: true,
        })
        if (totalDocs >= event.capacity) return err({ code: 'full' })
      }
      const { token, hash } = newManageToken()
      const created = await createBooking(req, {
        type: 'info',
        status: 'confirmed',
        paymentStatus: 'notRequired',
        service: serviceId,
        event: event.id,
        person: input.personId,
        format: event.format,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        confirmedAt: input.now.toISOString(),
        consents: input.consents,
        checkoutKey: input.checkoutKey,
        manageTokenHash: hash,
      })
      if (!created.ok) return created
      await emit(req, {
        name: 'booking.confirmed',
        bookingId: created.value.id,
        cause: 'noPaymentAtBooking',
      })
      return ok({ booking: summarise(created.value), manageToken: token })
    },
    keepOk,
  )
}
