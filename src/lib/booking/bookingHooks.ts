import { addMinutes } from 'date-fns'
import { ValidationError, type CollectionBeforeChangeHook } from 'payload'

import { canMove } from './policies'
import { newReference } from './reference'
import type { BookingType } from './states'

/**
 * The bookings collection's own rules (src/collections/Bookings.ts; docs/16 §3, §6), for every
 * write, the admin form's included. Plain modules only: the collection is loaded wherever the
 * Payload config is, so nothing here is marked server-only, and none of it reads a secret.
 *
 * - A new booking gets its reference (IIIC-S-24117) when it has none: the office books in the
 *   admin too, and the field is the server's to write.
 * - A booking with a start and a length gets its end, when none is given.
 * - A staff member's edit moves the state only along the table of moves (BOOKING_MOVES); a
 *   move into `confirmed` needs the time and the practitioner (or the fixed-time session), and
 *   stamps when it was confirmed. The server's own writes (no user on the request) are the booking
 *   module's operations, which check the moves themselves and emit their events.
 */

type Data = Record<string, unknown>

/** Draws a reference no booking has yet. */
async function freshReference(
  req: Parameters<CollectionBeforeChangeHook>[0]['req'],
  type: BookingType,
): Promise<string> {
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

const BOOKING_TYPES_WITH_LETTER: readonly string[] = ['session', 'call', 'info']

export const assignReference: CollectionBeforeChangeHook = async ({ data, operation, req }) => {
  if (operation !== 'create') return data
  const draft = data as Data
  if (!draft.reference && BOOKING_TYPES_WITH_LETTER.includes(String(draft.type))) {
    draft.reference = await freshReference(req, draft.type as BookingType)
  }
  return draft
}

export const fillEnd: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const draft = data as Data
  const merged = { ...(originalDoc ?? {}), ...draft } as Data
  const minutes = merged.durationMinutes
  const touched = 'startsAt' in draft || 'durationMinutes' in draft
  if (
    touched &&
    !draft.endsAt &&
    typeof merged.startsAt === 'string' &&
    typeof minutes === 'number' &&
    Number.isInteger(minutes) &&
    minutes > 0
  ) {
    draft.endsAt = addMinutes(new Date(merged.startsAt), minutes).toISOString()
  }
  return draft
}

const HOLDS: readonly string[] = ['held', 'pendingPayment']

export const keepMoves: CollectionBeforeChangeHook = ({ data, originalDoc, operation, req }) => {
  const draft = data as Data
  if (operation !== 'update' || !req.user || !originalDoc) return draft
  const from = String((originalDoc as Data).status)
  const to = draft.status === undefined ? from : String(draft.status)
  if (from === to) return draft
  if (!canMove(from, to)) {
    throw new ValidationError({
      collection: 'bookings',
      errors: [
        {
          path: 'status',
          message: `A booking cannot go from “${from}” to “${to}”. Use the booking’s actions for anything else.`,
        },
      ],
    })
  }
  const merged = { ...(originalDoc as Data), ...draft }
  if (to === 'confirmed') {
    const placed = merged.type === 'info' ? Boolean(merged.event) : Boolean(merged.practitioner)
    if (!placed || !merged.startsAt || !merged.endsAt) {
      throw new ValidationError({
        collection: 'bookings',
        errors: [
          {
            path: 'startsAt',
            message: 'Set the time and who it is with before confirming the booking.',
          },
        ],
      })
    }
    draft.confirmedAt = new Date().toISOString()
  }
  if (HOLDS.includes(from) && !HOLDS.includes(to)) draft.holdExpiresAt = null
  return draft
}
