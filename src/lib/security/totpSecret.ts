import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

import { Secret } from 'otpauth'

/**
 * Every staff account's TOTP secret is encrypted at rest (docs/08 §9); payload-totp itself
 * stores it as plain text. AES-256-GCM, with a key derived from PAYLOAD_SECRET by HKDF, so a
 * copy of the database alone cannot produce codes and no new variable is needed. When
 * PAYLOAD_SECRET is rotated, the old value stays in PAYLOAD_SECRET_PREVIOUS until every secret
 * has been written again under the new one (src/plugins/totpSecretAtRest.ts).
 */
const PREFIX = 'v1:'
const IV_BYTES = 12
const TAG_BYTES = 16

function keyFrom(payloadSecret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', payloadSecret, Buffer.alloc(0), 'iiic/staff-totp/v1', 32))
}

/** Whether a stored value is in this module's format (whichever key wrote it). */
export function isEncryptedTotpSecret(stored: string): boolean {
  return stored.startsWith(PREFIX)
}

export function encryptTotpSecret(secret: string, payloadSecret: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', keyFrom(payloadSecret), iv)
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64')
}

/** The secret, or null when the value was not written by this module or fails to decrypt. */
export function decryptTotpSecret(stored: string, payloadSecret: string): string | null {
  if (!isEncryptedTotpSecret(stored)) return null
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64')
    const decipher = createDecipheriv(
      'aes-256-gcm',
      keyFrom(payloadSecret),
      raw.subarray(0, IV_BYTES),
    )
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
    return Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return null
  }
}

/**
 * Stands in for a stored secret that cannot be decrypted: a fresh secret nobody holds. The
 * account then fails verification (closed) instead of counting as not enrolled, which would
 * let anyone with the password enrol their own authenticator.
 */
export function unknowableTotpSecret(): string {
  return new Secret({ size: 20 }).base32
}
