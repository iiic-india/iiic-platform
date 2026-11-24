import { addMinutes } from 'date-fns'
import { ValidationError, type CollectionBeforeChangeHook, type Validate } from 'payload'
import { select } from 'payload/shared'

import { hasRole } from '@/access/roles'

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
 * - A practitioner only marks their own session attended or a no-show (docs/05); the collection's
 *   field access keeps every other field to the office (src/collections/Bookings.ts).
 * - No staff edit confirms a hold or a lapsed hold: only a captured payment does (CLAUDE.md #5),
 *   through ConfirmBooking, which marks its write (CAPTURE_CONFIRMATION) for when an owner runs
 *   the poll as a job. A booking the office makes starts unpaid or with no payment needed.
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

/** What a practitioner may do to their own booking (docs/05): mark it attended or a no-show. */
const ATTENDANCE: readonly string[] = ['completed', 'noShow']

/** A hold, or one that lapsed, is confirmed by a captured payment only (CLAUDE.md #5). */
const CAPTURE_ONLY: readonly string[] = ['held', 'pendingPayment', 'expired']

/** The payment states a booking the office makes may start in: the payments module moves on. */
const STARTING_PAYMENT: readonly string[] = ['notRequired', 'unpaid']

/**
 * The payment state's own check: the office books a client in the admin as unpaid or needing no
 * payment, and never types any later state (CLAUDE.md #5). Its update access is nobody's, so only
 * the server, with access overridden, moves it on.
 */
export const validatePaymentStatus: Validate = (value, options) => {
  const { operation, overrideAccess, req } = options
  if (operation === 'create' && !overrideAccess && req.user && !STARTING_PAYMENT.includes(value)) {
    return 'A new booking is unpaid or needs no payment. Payments move it on.'
  }
  return select(value, options as Parameters<typeof select>[1])
}

/**
 * The context key ConfirmBooking sets on the write that confirms a hold for a captured payment:
 * the one write with a user on the request (a job an owner runs, docs/16 §5) that may take a hold
 * into `confirmed`. A request from the API or the admin cannot set a context.
 */
export const CAPTURE_CONFIRMATION = 'bookingCaptureConfirmation'

function refuse(path: string, message: string): never {
  throw new ValidationError({ collection: 'bookings', errors: [{ path, message }] })
}

export const keepMoves: CollectionBeforeChangeHook = ({
  context,
  data,
  originalDoc,
  operation,
  req,
}) => {
  const draft = data as Data
  if (operation !== 'update' || !req.user || !originalDoc) return draft
  const from = String((originalDoc as Data).status)
  const to = draft.status === undefined ? from : String(draft.status)
  if (from === to) return draft
  if (
    !hasRole(req.user, 'owner', 'operator') &&
    !(from === 'confirmed' && ATTENDANCE.includes(to))
  ) {
    refuse('status', 'Mark a session attended or a no-show. The office makes every other change.')
  }
  if (!canMove(from, to)) {
    refuse(
      'status',
      `A booking cannot go from “${from}” to “${to}”. Use the booking’s actions for anything else.`,
    )
  }
  if (
    to === 'confirmed' &&
    CAPTURE_ONLY.includes(from) &&
    context?.[CAPTURE_CONFIRMATION] !== true
  ) {
    refuse('status', 'A held booking is confirmed when its payment is captured, and not by hand.')
  }
  const merged = { ...(originalDoc as Data), ...draft }
  if (to === 'confirmed') {
    const placed = merged.type === 'info' ? Boolean(merged.event) : Boolean(merged.practitioner)
    if (!placed || !merged.startsAt || !merged.endsAt) {
      refuse('startsAt', 'Set the time and who it is with before confirming the booking.')
    }
    draft.confirmedAt = new Date().toISOString()
  }
  if (HOLDS.includes(from) && !HOLDS.includes(to)) draft.holdExpiresAt = null
  return draft
}
