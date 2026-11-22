import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

import { z } from 'zod'

/**
 * The calendar's secrets that travel in a link or a header (docs/16 §7): a practitioner's feed
 * token, in the feed's address, and a watch channel's token, which Google sends back with every
 * change notification. Each is random bytes from Node's generator, shown once; only its SHA-256
 * hash is kept on the calendar connection, so the database never holds a working token.
 */

/** 128 random bits for a feed link (src/lib/calendar/invites.ts, BuildFeed). */
export const FEED_TOKEN_BYTES = 16
/** 256 random bits for a watch channel; Google accepts up to 256 characters. */
export const CHANNEL_TOKEN_BYTES = 32

/** A fresh token: random bytes as base64url, safe in a path and a header. */
export function newToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url')
}

/** The token's SHA-256, as hex: what the connection keeps. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Whether a presented token is the one whose hash is kept, compared in constant time. */
export function tokenMatchesHash(token: string, hash: string | null | undefined): boolean {
  if (!token || !hash || !/^[0-9a-f]{64}$/.test(hash)) return false
  return timingSafeEqual(Buffer.from(hashToken(token), 'hex'), Buffer.from(hash, 'hex'))
}

/** A feed token as it arrives in the address: 16 bytes in base64url are 22 characters. */
export const FeedToken = z.string().regex(/^[A-Za-z0-9_-]{22}$/)
