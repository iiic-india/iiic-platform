import 'server-only'

import { createHmac } from 'node:crypto'

import type { PayloadRequest } from 'payload'

import { hashManageToken, manageLinkOpen } from '@/lib/booking/tokens'
import { env } from '@/lib/env'
import type { Booking } from '@/payload-types'

/**
 * The manage link a booking's message carries (docs/06 B2, B7; docs/16 §12, E: "whoever sends the
 * new confirmation issues one"). A booking the office confirmed or moved has no manage token yet,
 * and the token itself is never stored, so the message makes one for the booking it is about:
 * derived from a key of its own under PAYLOAD_SECRET and the booking's id, 32 bytes in base64url,
 * the shape of M3's tokens (src/lib/booking/tokens.ts). The booking keeps only its SHA-256 in
 * `manageTokenHash`, as for every token. Being derived, the same token comes out again when the
 * message is tried again or falls back to email, so a retry never strands the person with a link
 * that no longer opens; nothing about it is written to the message or a log.
 *
 * A booking whose token was handed to the client's browser (their own booking, rescheduling or
 * time request) keeps that one: its message carries no link, and says how to reach IIIC instead.
 */

const LABEL = 'iiic:manage-link:v1'

/** The token a message gives booking `id` under one secret. */
export function derivedManageToken(secret: string, bookingId: number): string {
  const key = createHmac('sha256', secret).update(LABEL).digest()
  return createHmac('sha256', key).update(`booking:${bookingId}`).digest('base64url')
}

function secrets(): string[] {
  const settings = env()
  return [settings.PAYLOAD_SECRET, settings.PAYLOAD_SECRET_PREVIOUS].filter(
    (secret): secret is string => Boolean(secret),
  )
}

async function storedHash(req: PayloadRequest, bookingId: number): Promise<string | null> {
  const booking = await req.payload.findByID({
    collection: 'bookings',
    id: bookingId,
    depth: 0,
    showHiddenFields: true,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  return booking?.manageTokenHash ?? null
}

/** The page the token opens. */
function pageFor(token: string): string {
  return `${env().siteUrl.replace(/\/+$/, '')}/b/${token}`
}

/**
 * The booking's manage page for its message: the message's own token when the booking has none
 * yet (its hash is stored then) or already has this one; null when the link no longer works or
 * the booking holds a token given to someone else.
 */
export async function manageUrlFor(
  req: PayloadRequest,
  booking: Pick<Booking, 'id' | 'status' | 'endsAt'>,
  now: Date = new Date(),
): Promise<string | null> {
  if (!manageLinkOpen(booking, now)) return null
  const tokens = secrets().map((secret) => derivedManageToken(secret, booking.id))
  const current = tokens[0]
  if (!current) return null
  const stored = await storedHash(req, booking.id)
  if (stored) {
    const ours = tokens.find((token) => hashManageToken(token) === stored)
    return ours ? pageFor(ours) : null
  }
  await req.payload.update({
    collection: 'bookings',
    where: { and: [{ id: { equals: booking.id } }, { manageTokenHash: { exists: false } }] },
    data: { manageTokenHash: hashManageToken(current) },
    depth: 0,
    overrideAccess: true,
    req,
  })
  // Whoever wrote first wins; the link goes out only if the stored token is this one.
  return (await storedHash(req, booking.id)) === hashManageToken(current) ? pageFor(current) : null
}
