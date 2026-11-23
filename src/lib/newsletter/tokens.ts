import { createHash, createHmac, hkdfSync, timingSafeEqual } from 'node:crypto'

/**
 * The newsletter's confirmation link (docs/19 §8; D-10). A pending signup keeps only the SHA-256
 * of its token, never the token: the token is an HMAC of the entry's id and the moment its link
 * stops working, under a key derived from PAYLOAD_SECRET for this purpose alone, so N1 can put the
 * same link in its email at send time (a retried send renders the same link) and a new signup for
 * the same address, with a new expiry, makes the earlier link useless. Pure: the secret is passed
 * in, so the module is free of `server-only` and tested without the environment.
 */

/** How long a confirmation link works (docs/19 §8). */
export const CONFIRM_DAYS = 7

const DAY_MS = 86_400_000

/** A token is 32 bytes, written base64url: 43 characters. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

/** The key for confirmation links, derived from the app's secret (HKDF-SHA256). */
export function confirmationKey(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'iiic-newsletter', 'newsletter-confirm', 32))
}

/** When a link made now stops working, to the second (what the database keeps exactly). */
export function confirmExpiry(now: Date): Date {
  const at = new Date(now.getTime() + CONFIRM_DAYS * DAY_MS)
  at.setUTCMilliseconds(0)
  return at
}

/** The token for one pending signup and its expiry. */
export function confirmationToken(key: Buffer, subscriberId: number, expiresAt: Date): string {
  return createHmac('sha256', key)
    .update(`${subscriberId}:${expiresAt.toISOString()}`)
    .digest('base64url')
}

/** What the entry keeps: the token's SHA-256, in hex (64 characters). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Whether a string can be a token at all, before anything is looked up. */
export function isToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value)
}

/** Whether a stored hash belongs to a token, compared in constant time. */
export function tokenMatches(token: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || storedHash.length !== 64) return false
  return timingSafeEqual(Buffer.from(hashToken(token)), Buffer.from(storedHash))
}

/** The message variant of one confirmation round, so a second signup gets an email of its own. */
export function confirmationVariant(expiresAt: Date): string {
  return `c${Math.floor(expiresAt.getTime() / 1000)}`
}
