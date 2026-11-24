import { createHash, randomBytes } from 'node:crypto'

/**
 * The tracked link's token (docs/17 §5): 32 random bytes, base64url, put in the email once and
 * never stored. The version keeps its SHA-256 in `linkTokenHash` (unique, hidden from every
 * read), so the database alone cannot open a proposal. Tokens are looked up by their hash only.
 */
export const LINK_TOKEN_BYTES = 32

/** 32 bytes in base64url are 43 characters, without padding. */
export const LINK_TOKEN = /^[A-Za-z0-9_-]{43}$/

/** The stored form of a token: its SHA-256, in hex. */
export function hashLinkToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** A new token and the hash to store for it. */
export function newLinkToken(): { token: string; hash: string } {
  const token = randomBytes(LINK_TOKEN_BYTES).toString('base64url')
  return { token, hash: hashLinkToken(token) }
}

/** Whether a value has a token's shape, checked before anything is looked up with it. */
export function isLinkToken(value: unknown): value is string {
  return typeof value === 'string' && LINK_TOKEN.test(value)
}

/** The tracked link's path on the site, and its PDF's. */
export const linkPath = (token: string) => `/p/${token}`
export const linkPdfPath = (token: string) => `/p/${token}/pdf`

/** A file's SHA-256, in hex (the copy sent is recorded by it). */
export function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
