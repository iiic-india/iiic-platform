import { z } from 'zod'

/**
 * A certificate's printed ID and its verify token (docs/04 `certificates`; D-39; docs/18 §4). The
 * shapes and their checks live here, once, for the collection, the issuing module and the public
 * verify pages, which validate what a visitor types or scans before any lookup (Zod at the
 * boundary).
 *
 * The ID reads `IIIC-C-<year>-<number>-<check>`: the year of issue, a number counted from 1 within
 * that year (at least four digits), and a Luhn check digit over the year and the number, so a
 * mistyped digit is caught before the lookup. The token is 128 random bits in base64url (22
 * characters); only its SHA-256 is stored.
 */

export const CERTIFICATE_STATUSES = [
  { value: 'valid', label: 'Valid' },
  { value: 'revoked', label: 'Revoked' },
] as const

export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number]['value']

export const CERTIFICATE_ID_PATTERN = /^IIIC-C-(\d{4})-(\d{4,6})-(\d)$/

/** The verify token's shape: 16 random bytes, base64url without padding. */
export const VERIFY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/

/** The Luhn check digit of a string of digits (ISO/IEC 7812-1). */
export function luhnDigit(digits: string): number {
  if (!/^\d+$/.test(digits)) throw new RangeError('luhnDigit takes digits only')
  let sum = 0
  for (let index = 0; index < digits.length; index += 1) {
    // Doubling starts from the rightmost digit of the payload, which sits beside the check digit.
    let digit = Number(digits[digits.length - 1 - index])
    if (index % 2 === 0) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return (10 - (sum % 10)) % 10
}

/** The printed ID of a year's nth certificate. */
export function formatCertificateId(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new RangeError('year must be a four-digit year')
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999_999) {
    throw new RangeError('sequence must be between 1 and 999999')
  }
  const number = String(sequence).padStart(4, '0')
  return `IIIC-C-${year}-${number}-${luhnDigit(`${year}${number}`)}`
}

/** The year and number of a printed ID, or null when it is not one or its check digit is wrong. */
export function parseCertificateId(value: string): { year: number; sequence: number } | null {
  const match = CERTIFICATE_ID_PATTERN.exec(value)
  if (!match) return null
  const [, year, number, check] = match
  if (luhnDigit(`${year}${number}`) !== Number(check)) return null
  return { year: Number(year), sequence: Number(number) }
}

/**
 * What /institute/verify accepts: an ID as a person types it, with spaces trimmed and letters in
 * any case, held to the format and its check digit.
 */
export const typedCertificateId = z
  .string()
  .trim()
  .max(40)
  .transform((value) => value.toUpperCase().replace(/\s+/g, ''))
  .refine((value) => parseCertificateId(value) !== null, {
    message: 'Enter the certificate ID as printed, such as IIIC-C-2027-0001-9.',
  })

/** What /institute/verify/[token] accepts before it hashes the token and looks it up. */
export const verifyToken = z.string().regex(VERIFY_TOKEN_PATTERN)
