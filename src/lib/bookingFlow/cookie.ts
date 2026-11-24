import { createHash, timingSafeEqual } from 'node:crypto'

import { z } from 'zod'

/**
 * The booking cookie (docs/16 §6; docs/12 §10, the cookie inventory): set when a booking is
 * made, so that the payment step and the confirmation page show the booking's details only to
 * the browser that made it. Anyone else who opens the address learns only that a booking exists
 * and that its details are in the confirmation message.
 *
 * It holds the booking's reference, its checkout key and its manage link's token, each a secret
 * only that browser and the confirmation message know; the server compares them with the
 * booking's stored checkout key and the token's hash, never trusting the reference alone.
 * HttpOnly, SameSite=Lax, Secure over HTTPS, under /book, for two hours: strictly necessary.
 */
export const BOOKING_COOKIE = 'iiic-booking'
export const BOOKING_COOKIE_PATH = '/book'
export const BOOKING_COOKIE_MAX_AGE = 2 * 60 * 60

const Value = z.strictObject({
  ref: z.string().regex(/^IIIC-[SCI]-\d{5}$/),
  key: z
    .string()
    .regex(/^[A-Za-z0-9_-]{16,128}$/)
    .nullable(),
  token: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .nullable(),
})

export type BookingCookie = z.infer<typeof Value>

export function encodeBookingCookie(value: BookingCookie): string {
  return Buffer.from(JSON.stringify(Value.parse(value)), 'utf8').toString('base64url')
}

export function decodeBookingCookie(raw: string | undefined | null): BookingCookie | null {
  if (!raw || raw.length > 400) return null
  try {
    const parsed = Value.safeParse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function sameText(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest()
  const right = createHash('sha256').update(b).digest()
  return timingSafeEqual(left, right)
}

/**
 * Whether the cookie belongs to this booking: the same reference, and either the checkout key
 * the booking was made with or the manage token whose hash it keeps.
 */
export function cookieOpens(
  cookie: BookingCookie | null,
  booking: { reference: string; checkoutKey?: string | null; manageTokenHash?: string | null },
  hashToken: (token: string) => string,
): boolean {
  if (!cookie || cookie.ref !== booking.reference) return false
  if (cookie.key && booking.checkoutKey && sameText(cookie.key, booking.checkoutKey)) return true
  if (cookie.token && booking.manageTokenHash) {
    return sameText(hashToken(cookie.token), booking.manageTokenHash)
  }
  return false
}
