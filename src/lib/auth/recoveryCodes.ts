import { createHash, randomInt } from 'node:crypto'

/**
 * Staff recovery codes (docs/07, "Known gaps": TOTP with recovery codes). Each code is
 * single-use and stands in for the authenticator once: using one removes the account's TOTP,
 * and the person sets up a new authenticator straight away. Codes are shown once and stored
 * only as SHA-256 hashes; 12 characters of Crockford base32 carry 60 random bits, so a hash
 * cannot be reversed by guessing, and wrong codes count towards the account lockout.
 */
export const RECOVERY_CODE_COUNT = 10

// Crockford base32: no I, L, O or U, so a code read aloud or copied by hand stays unambiguous.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** A new code such as `7K2M-9QXR-4T8W`, in three groups of four for reading. */
export function newRecoveryCode(): string {
  const characters = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)])
  return [characters.slice(0, 4), characters.slice(4, 8), characters.slice(8)]
    .map((group) => group.join(''))
    .join('-')
}

/** Upper case, without separators, and with the letters people mistype for digits mapped back. */
export function normaliseRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
}

export function hashRecoveryCode(input: string): string {
  return createHash('sha256').update(normaliseRecoveryCode(input)).digest('hex')
}
