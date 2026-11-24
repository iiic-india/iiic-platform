import 'server-only'

import type { PayloadRequest, RequestContext } from 'payload'

import type { Result } from '@/lib/result'
import type { Booking } from '@/payload-types'

import { guarded, isUniqueOn } from './guard'
import { newReference } from './reference'
import type { BookingType } from './states'

/**
 * Writing bookings: every create and every move into a state that takes time goes through the
 * double-booking guard (src/lib/booking/guard.ts), so the database's exclusion constraint has
 * the last word and its refusal comes back as `slot-taken`. Server writes, access overridden:
 * the operations check who is asking before they get here.
 */

/** A booking's data as the server writes it, without its reference, which is drawn here. */
export type NewBooking = Omit<Booking, 'id' | 'reference' | 'createdAt' | 'updatedAt'>

/** Draws a reference no booking has yet (docs/16 §6). */
async function freshReference(req: PayloadRequest, type: BookingType): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const reference = newReference(type)
    const { totalDocs } = await req.payload.count({
      collection: 'bookings',
      where: { reference: { equals: reference } },
      overrideAccess: true,
      req,
    })
    if (totalDocs === 0) return reference
  }
  throw new Error('No free booking reference after 20 draws.')
}

/**
 * Creates a booking under the guard, with a fresh reference, drawn again if another booking took
 * the same one at the same moment. Any other unique value already taken (a checkout key) is
 * thrown for the caller.
 */
export async function createBooking(
  req: PayloadRequest,
  data: NewBooking,
): Promise<Result<Booking, { code: 'slot-taken' }>> {
  for (let attempt = 0; ; attempt += 1) {
    const reference = await freshReference(req, data.type)
    try {
      return await guarded(req, () =>
        req.payload.create({
          collection: 'bookings',
          data: { ...data, reference } as Booking,
          depth: 0,
          overrideAccess: true,
          req,
        }),
      )
    } catch (error) {
      if (attempt < 3 && isUniqueOn(error, 'reference') && !isUniqueOn(error, 'checkoutKey')) {
        continue
      }
      throw error
    }
  }
}

/** Updates a booking under the guard: a move into a state that takes time may be refused. */
export async function updateBooking(
  req: PayloadRequest,
  id: number,
  data: Partial<NewBooking>,
  context?: RequestContext,
): Promise<Result<Booking, { code: 'slot-taken' }>> {
  return guarded(req, () =>
    req.payload.update({
      collection: 'bookings',
      id,
      data: data as Partial<Booking>,
      depth: 0,
      overrideAccess: true,
      req,
      ...(context ? { context } : {}),
    }),
  )
}
