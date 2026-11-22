import { z } from 'zod'

import type { ConsentPurpose } from '@/lib/privacy/purposes'
import { toE164 } from '@/lib/phone'

/**
 * Step 3 of the booking flow (docs/03 F3, "Details"), checked on the server before anything is
 * stored (CLAUDE.md #4, #8): what each kind of booking asks, the mobile number in E.164, an email
 * with a likely typo named, and one unticked box per consent, never bundled (docs/08 §3, §5).
 * Pure, so the rules are tested without a database; the server action calls `parseDetails`.
 */

export const FLOW_TYPES = ['session', 'call', 'info'] as const
export type FlowType = (typeof FLOW_TYPES)[number]

export function isFlowType(value: unknown): value is FlowType {
  return typeof value === 'string' && (FLOW_TYPES as readonly string[]).includes(value)
}

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

export const AGE_BAND_VALUES = ['under18', 'adult'] as const
export type AgeBand = (typeof AGE_BAND_VALUES)[number]
export const WHO_FOR_VALUES = ['yourself', 'family'] as const

/** What a person sees when a field needs fixing: each one says what to do (docs/03 F3). */
export const DETAIL_MESSAGES = {
  fullName: 'Enter your full name.',
  mobile:
    'Enter a mobile number we can reach you on. A number outside India needs its country code.',
  email: 'Enter a complete email address, like name@example.com.',
  whoFor: 'Choose who the session is for.',
  ageBand: 'Choose the age band of the person the session is for.',
  guardian: 'A parent or guardian books for anyone under 18. Tick the box to say you are one.',
  company: 'Enter your company’s name.',
  bookingCommunications:
    'Tick the box about booking messages: we need it to send your confirmation and reminders.',
} as const

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

const text = (max: number) => z.string().trim().max(max)
const required = (max: number, message: string) => text(max).min(1, message)

const Email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, DETAIL_MESSAGES.email)
  .pipe(z.email(DETAIL_MESSAGES.email))

const Mobile = z
  .string()
  .trim()
  .max(30, DETAIL_MESSAGES.mobile)
  .transform((value, context) => {
    const e164 = toE164(value)
    if (!e164) {
      context.addIssue({ code: 'custom', message: DETAIL_MESSAGES.mobile })
      return z.NEVER
    }
    return e164
  })

/** A tick in a box: only the literal "on" or true counts; nothing is ticked by default. */
const Tick = z
  .union([z.literal('on'), z.literal(true), z.literal('true')])
  .optional()
  .transform((value) => value !== undefined)

const Consents = z.object({
  bookingCommunications: Tick,
  marketingEmail: Tick,
  marketingWhatsapp: Tick,
})

const SessionDetails = z.object({
  type: z.literal('session'),
  fullName: required(200, DETAIL_MESSAGES.fullName),
  mobile: Mobile,
  email: Email,
  whoFor: z.enum(WHO_FOR_VALUES, DETAIL_MESSAGES.whoFor),
  ageBand: z.enum(AGE_BAND_VALUES, DETAIL_MESSAGES.ageBand),
  guardian: Tick,
  consents: Consents,
})

const CallDetails = z.object({
  type: z.literal('call'),
  fullName: required(200, DETAIL_MESSAGES.fullName),
  mobile: Mobile,
  email: Email,
  company: required(200, DETAIL_MESSAGES.company),
  role: text(100).optional(),
  teamSize: text(50).optional(),
  sector: text(100).optional(),
  consents: Consents,
})

const InfoDetails = z.object({
  type: z.literal('info'),
  fullName: required(200, DETAIL_MESSAGES.fullName),
  mobile: Mobile,
  email: Email,
  consents: Consents,
})

export const DetailsInput = z.discriminatedUnion('type', [SessionDetails, CallDetails, InfoDetails])
export type Details = z.output<typeof DetailsInput>

export type FieldError = { field: string; message: string }

/** The consents the person gave, among those this booking offers: the ticked boxes only. */
export function consentsGiven(details: Details): ConsentPurpose[] {
  const ageBand = details.type === 'session' ? details.ageBand : null
  return consentsOffered(details.type, ageBand).filter((purpose) => {
    const ticked = details.consents[purpose as keyof Details['consents']]
    return ticked === true
  })
}

/**
 * Checks step 3. Every problem comes back at once, each with the field it belongs to, for the
 * error summary and the inline messages (docs/03 F3, "every error explains the fix").
 */
export function parseDetails(
  raw: unknown,
): { ok: true; value: Details } | { ok: false; errors: FieldError[] } {
  const parsed = DetailsInput.safeParse(raw)
  const errors: FieldError[] = parsed.success
    ? []
    : parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'type',
        message: issue.message,
      }))
  if (parsed.success) {
    const details = parsed.data
    if (details.type === 'session' && details.ageBand === 'under18' && !details.guardian) {
      errors.push({ field: 'guardian', message: DETAIL_MESSAGES.guardian })
    }
    if (!details.consents.bookingCommunications) {
      errors.push({
        field: 'consents.bookingCommunications',
        message: DETAIL_MESSAGES.bookingCommunications,
      })
    }
  }
  if (errors.length || !parsed.success) {
    const seen = new Set<string>()
    return { ok: false, errors: errors.filter((e) => !seen.has(e.field) && seen.add(e.field)) }
  }
  return { ok: true, value: parsed.data }
}
