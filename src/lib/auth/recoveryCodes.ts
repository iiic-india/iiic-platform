import { pbkdf2, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

import {
  normaliseRecoveryCode,
  RECOVERY_CODE_ALPHABET,
  RECOVERY_CODE_LENGTH,
} from './recoveryCodeShape'

/**
 * Staff recovery codes (docs/08 §9: TOTP with recovery codes). Each is single-use and stands in
 * for the authenticator once: using one removes the account's TOTP, and the person sets up a
 * new authenticator straight away.
 *
 * Sixteen characters of Crockford base32 carry 80 random bits. That length, not the lockout,
 * puts guessing out of reach: a sign-in with the password resets Payload's count of wrong
 * attempts. Codes are shown once and stored as PBKDF2-SHA256 hashes, each with its own salt, the
 * form NIST SP 800-63B (§5.1.2.2) asks for look-up secrets under 112 bits. No application
 * secret goes into them, so rotating PAYLOAD_SECRET (docs/08 §9) leaves every code working.
 */
export const RECOVERY_CODE_COUNT = 10

const SCHEME = 'pbkdf2-sha256'
const ITERATIONS = 100_000
// A tampered row cannot make one check run for minutes.
const MAX_ITERATIONS = 1_000_000
const SALT_BYTES = 16
const HASH_BYTES = 32

function derive(code: string, salt: Buffer, iterations: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    pbkdf2(normaliseRecoveryCode(code), salt, iterations, HASH_BYTES, 'sha256', (error, key) =>
      error ? reject(error) : resolve(key),
    )
  })
}

/** A new code such as `7K2M-9QXR-4T8W-ZB3N`, in four groups of four for reading. */
export function newRecoveryCode(): string {
  const characters = Array.from(
    { length: RECOVERY_CODE_LENGTH },
    () => RECOVERY_CODE_ALPHABET[randomInt(RECOVERY_CODE_ALPHABET.length)],
  )
  return Array.from({ length: RECOVERY_CODE_LENGTH / 4 }, (_, group) =>
    characters.slice(group * 4, group * 4 + 4).join(''),
  ).join('-')
}

/** The stored form of a code, `pbkdf2-sha256$<iterations>$<salt>$<hash>`; never the code. */
export async function hashRecoveryCode(code: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const hash = await derive(code, salt, ITERATIONS)
  return [SCHEME, ITERATIONS, salt.toString('base64url'), hash.toString('base64url')].join('$')
}

/** Whether a typed code is the one behind a stored hash; a value in any other form never is. */
export async function matchesRecoveryCode(code: string, stored: string): Promise<boolean> {
  const [scheme, rounds, salt, hash] = stored.split('$')
  const iterations = Number(rounds)
  if (scheme !== SCHEME || !salt || !hash) return false
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) return false
  const expected = Buffer.from(hash, 'base64url')
  if (expected.length !== HASH_BYTES) return false
  const actual = await derive(code, Buffer.from(salt, 'base64url'), iterations)
  return timingSafeEqual(actual, expected)
}
