import type { SignInChannel } from '../contract'

/**
 * Where Better Auth 1.7.27 keeps a code, by the identifier its plugins build (docs/20 §4.2): the
 * email plugin's `toOTPIdentifier(type, email)` and the phone plugin's `phoneNumberOTPIdentifier`.
 * Better Auth hashes the identifier before it stores it (`verification.storeIdentifier`), so the
 * address is never in `customer_auth.verifications` in plain text. IIIC's plugin forgets a code
 * and counts its tries under the same identifier; a unit test on the installed version holds the
 * two spellings together, and an upgrade that changes either fails it.
 *
 * A sign-in code and a second detail's code to the same email are kept apart: a sign-in uses the
 * email plugin's `sign-in` type, a second detail its `email-verification` type. WhatsApp has one
 * identifier per number in 1.7.27, so a new code for either purpose replaces the other.
 */
export type CodePurpose = 'signIn' | 'addDetail'

/** The email plugin's code type for each purpose. */
export const EMAIL_CODE_TYPE = {
  signIn: 'sign-in',
  addDetail: 'email-verification',
} as const satisfies Record<CodePurpose, string>

export function codeIdentifier(
  purpose: CodePurpose,
  channel: SignInChannel,
  value: string,
): string {
  return channel === 'email'
    ? `${EMAIL_CODE_TYPE[purpose]}-otp-${value}`
    : `phone-number-otp-${value}`
}

/**
 * The tries a stored code has used: Better Auth keeps `<code or its hash>:<wrong tries>` and adds
 * one for each wrong code (both plugins split at the last colon).
 */
export function triesUsed(stored: string): number {
  const raw = stored.slice(stored.lastIndexOf(':') + 1)
  const tries = Number(raw)
  return Number.isSafeInteger(tries) && tries > 0 ? tries : 0
}

/**
 * The address a WhatsApp-only account's user is given, because Better Auth's users need an email:
 * a reserved domain that never receives mail (RFC 2606), never written to, never shown.
 */
export function placeholderEmail(e164: string): string {
  return `wa-${e164.replace(/\D/g, '')}@accounts.invalid`
}

export const PLACEHOLDER_DOMAIN = '@accounts.invalid'
