import { createHash, randomBytes } from 'node:crypto'

/**
 * The manage link's token (docs/03 F4; docs/16 §6): 32 random bytes, base64url, sent once in the
 * confirmation and never stored. The booking keeps its SHA-256 in `manageTokenHash` (hidden from
 * every read), so the database alone cannot open a booking. A token opens one booking until the
 * booking ends; a reschedule issues a new one for the new booking.
 */
export const MANAGE_TOKEN_BYTES = 32

/** What a token looks like: 32 bytes in base64url are 43 characters, without padding. */
export const MANAGE_TOKEN = /^[A-Za-z0-9_-]{43}$/

/** The stored form of a token: its SHA-256, in hex. */
export function hashManageToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** A new token and the hash to store for it. */
export function newManageToken(): { token: string; hash: string } {
  const token = randomBytes(MANAGE_TOKEN_BYTES).toString('base64url')
  return { token, hash: hashManageToken(token) }
}

/** Whether a value has a token's shape, checked before anything is looked up with it. */
export function isManageToken(value: unknown): value is string {
  return typeof value === 'string' && MANAGE_TOKEN.test(value)
}

/**
 * Whether a booking's manage link still works: until the booking ends, or, for a time request
 * with no time yet, while it waits.
 */
export function manageLinkOpen(
  booking: { status: string; endsAt?: string | null },
  now: Date,
): boolean {
  if (booking.endsAt) return new Date(booking.endsAt) > now
  return booking.status === 'requested'
}
