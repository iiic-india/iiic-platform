import 'server-only'

import type { PayloadRequest } from 'payload'

import { err, ok, type Result } from '@/lib/result'
import { readLegalInformation } from '@/lib/settings/source'
import type { Booking } from '@/payload-types'

import { bookingView } from './bookingEvent'
import { buildInvite, clientInvite, type InviteParties } from './ics'

/**
 * The `.ics` invite attached to a booking's confirmation (B2) and to each change (B7), for the
 * messages M6 sends. Its UID is the first booking's reference in the chain of reschedules, and
 * SEQUENCE counts the reschedules since, so the client's calendar moves the one event it holds;
 * a cancelled booking gives METHOD:CANCEL with the next number. No price (D-21), no manage link,
 * nothing said in a session.
 */

type Ref = number | { id: number } | null | undefined
const idOf = (value: Ref): number | null =>
  typeof value === 'number' ? value : (value?.id ?? null)

/** More reschedules than any booking has; the walk back stops there. */
const MAX_CHAIN = 50

async function load(req: PayloadRequest, id: number): Promise<Booking | null> {
  return req.payload.findByID({
    collection: 'bookings',
    id,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
    req,
  })
}

/** The first booking's reference in a chain of reschedules, and how many moves followed it. */
export async function inviteChain(
  req: PayloadRequest,
  booking: Booking,
): Promise<{ rootReference: string; changes: number }> {
  let rootReference = booking.reference
  let changes = 0
  let previous = idOf(booking.rescheduledFrom)
  while (previous && changes < MAX_CHAIN) {
    const before = await load(req, previous)
    if (!before) break
    rootReference = before.reference
    changes += 1
    previous = idOf(before.rescheduledFrom)
  }
  return { rootReference, changes }
}

export type BookingInviteError =
  { code: 'not-found' } | { code: 'no-time' } | { code: 'invalid-invite' }

export async function bookingInvite(
  req: PayloadRequest,
  input: { bookingId: number; siteUrl: string; parties?: InviteParties },
): Promise<Result<string, BookingInviteError>> {
  const booking = await load(req, input.bookingId)
  if (!booking) return err({ code: 'not-found' })
  const serviceId = idOf(booking.service)
  const personId = idOf(booking.person)
  const practitionerId = idOf(booking.practitioner)
  const service = serviceId
    ? await req.payload.findByID({
        collection: 'services',
        id: serviceId,
        select: { name: true, format: true },
        depth: 0,
        overrideAccess: true,
        disableErrors: true,
        req,
      })
    : null
  const client = personId
    ? await req.payload.findByID({
        collection: 'people',
        id: personId,
        select: { fullName: true },
        depth: 0,
        overrideAccess: true,
        disableErrors: true,
        req,
      })
    : null
  const practitioner = practitionerId
    ? await req.payload.findByID({
        collection: 'practitioners',
        id: practitionerId,
        select: { publicName: true },
        depth: 0,
        overrideAccess: true,
        disableErrors: true,
        req,
      })
    : null
  const officeAddress = (await readLegalInformation(req.payload)).address ?? null
  const chain = await inviteChain(req, booking)
  const invite = clientInvite({
    view: bookingView({ booking, service, client, officeAddress }),
    ...chain,
    cancelled: booking.status === 'cancelledByClient' || booking.status === 'cancelledByIiic',
    meetingUrl: booking.meetingUrl ?? null,
    practitionerName: practitioner?.publicName ?? null,
    siteUrl: input.siteUrl,
  })
  if (!invite) return err({ code: 'no-time' })
  const text = buildInvite({ ...invite, ...input.parties })
  return text.ok ? ok(text.value) : text
}
