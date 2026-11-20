/**
 * What a staff recovery code looks like (src/lib/auth/recoveryCodes.ts), with nothing that
 * needs the server, so the verify page can check a typed code before sending it.
 */
export const RECOVERY_CODE_LENGTH = 16

// Crockford base32: no I, L, O or U, so a code read aloud or copied by hand stays unambiguous.
export const RECOVERY_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Upper case, without separators, and with the letters people mistype for digits mapped back. */
export function normaliseRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
}

/** Whether a typed code could be one: sixteen characters of the alphabet, once normalised. */
export function isRecoveryCodeShape(input: string): boolean {
  const code = normaliseRecoveryCode(input)
  return (
    code.length === RECOVERY_CODE_LENGTH &&
    [...code].every((character) => RECOVERY_CODE_ALPHABET.includes(character))
  )
}
