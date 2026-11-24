import type { ConsentPurpose } from '@/lib/privacy/purposes'

/**
 * The booking flow's vocabulary that the browser needs too (kept free of the server's phone and
 * Payload imports): the kinds of booking, the consents each offers, the answers step 3 takes and
 * the email-typo hint. src/lib/bookingFlow/details.ts checks the same on the server.
 */

export const FLOW_TYPES = ['session', 'call', 'info'] as const
export type FlowType = (typeof FLOW_TYPES)[number]

export function isFlowType(value: unknown): value is FlowType {
  return typeof value === 'string' && (FLOW_TYPES as readonly string[]).includes(value)
}

export const AGE_BAND_VALUES = ['under18', 'adult'] as const
export type AgeBand = (typeof AGE_BAND_VALUES)[number]
export const WHO_FOR_VALUES = ['yourself', 'family'] as const

/**
 * The consents each kind of booking offers, each a box of its own. Booking messages are the one
 * the booking needs (the confirmation, the reminders and the manage link travel by them); the
 * others are optional, and a booking never waits on them (docs/08 §5, "Forced action"). A
 * counselling booking offers no marketing consent, and nobody under 18 is offered one (docs/08
 * §3), so nothing from a counselling booking ever feeds a promotion (CLAUDE.md #3).
 */
export const REQUIRED_CONSENT: ConsentPurpose = 'bookingCommunications'

export function consentsOffered(type: FlowType, ageBand?: AgeBand | null): ConsentPurpose[] {
  if (type === 'session' || ageBand === 'under18') return [REQUIRED_CONSENT]
  return [REQUIRED_CONSENT, 'marketingEmail', 'marketingWhatsapp']
}

/**
 * Domains people often mistype, and what they meant. A suggestion only: the address is kept as
 * typed unless the person changes it.
 */
const DOMAIN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmail.in': 'gmail.com',
  'yaho.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'hotmial.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outlook.co': 'outlook.com',
  'rediffmai.com': 'rediffmail.com',
  'redifmail.com': 'rediffmail.com',
  'iclod.com': 'icloud.com',
}

/** The address the person probably meant, when its domain is a common typo; else null. */
export function suggestEmail(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 1) return null
  const domain = email.slice(at + 1).toLowerCase()
  const meant = DOMAIN_TYPOS[domain]
  return meant ? `${email.slice(0, at)}@${meant}` : null
}
