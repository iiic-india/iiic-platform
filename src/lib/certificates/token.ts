import { createHash, randomBytes } from 'node:crypto'

/**
 * The verify token a certificate's QR code carries (docs/18 §4; D-39): 128 random bits in
 * base64url, 22 characters (`VERIFY_TOKEN_PATTERN`, src/lib/certificates/ids.ts). The database
 * keeps only its SHA-256, so the link exists only on the PDF and in the email that carries it; a
 * copy of the database cannot be turned back into working links.
 */

/** The path the QR code opens, on the platform domain; it never changes (docs/18 §8). */
export const VERIFY_PATH = '/institute/verify'

/** A fresh token: `crypto.randomBytes(16)` in base64url, without padding. */
export function newVerifyToken(bytes: Uint8Array = randomBytes(16)): string {
  if (bytes.length !== 16) throw new RangeError('a verify token is 16 bytes')
  return Buffer.from(bytes).toString('base64url')
}

/** The token's SHA-256 in hex (64 characters): what `verifyTokenHash` stores and looks up. */
export function hashVerifyToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** The address printed under the QR code and encoded in it. */
export function verifyUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, '')}${VERIFY_PATH}/${token}`
}

/** The SHA-256 of a file in hex, kept beside the PDF (`pdfSha256`). */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
