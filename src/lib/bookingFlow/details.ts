import { z } from 'zod'

import { toE164 } from '@/lib/phone'
import type { ConsentPurpose } from '@/lib/privacy/purposes'

import { AGE_BAND_VALUES, consentsOffered, WHO_FOR_VALUES } from './options'

export {
  AGE_BAND_VALUES,
  consentsOffered,
  FLOW_TYPES,
  isFlowType,
  REQUIRED_CONSENT,
  suggestEmail,
  WHO_FOR_VALUES,
  type AgeBand,
  type FlowType,
} from './options'

/**
 * Step 3 of the booking flow (docs/03 F3, "Details"), checked on the server before anything is
 * stored (CLAUDE.md #4, #8): what each kind of booking asks, the mobile number in E.164, and one
 * unticked box per consent, never bundled (docs/08 §3, §5). Pure, so the rules are tested without
 * a database; the server action calls `parseDetails`.
 */

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

const text = (max: number) => z.string().trim().max(max)
const required = (max: number, message: string) => text(max).min(1, message)

const Email = z
  .string(DETAIL_MESSAGES.email)
  .trim()
  .toLowerCase()
  .max(254, DETAIL_MESSAGES.email)
  .pipe(z.email(DETAIL_MESSAGES.email))

const Mobile = z
  .string(DETAIL_MESSAGES.mobile)
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

const isTick = (value: unknown) => value === 'on' || value === true || value === 'true'

const Consents = z.object({
  bookingCommunications: Tick,
  marketingEmail: Tick,
  marketingWhatsapp: Tick,
})

const Name = required(200, DETAIL_MESSAGES.fullName)

const SessionDetails = z.object({
  type: z.literal('session'),
  fullName: Name,
  mobile: Mobile,
  email: Email,
  whoFor: z.enum(WHO_FOR_VALUES, DETAIL_MESSAGES.whoFor),
  ageBand: z.enum(AGE_BAND_VALUES, DETAIL_MESSAGES.ageBand),
  guardian: Tick,
  consents: Consents,
})

const CallDetails = z.object({
  type: z.literal('call'),
  fullName: Name,
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
  fullName: Name,
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
  const given = raw as
    { ageBand?: unknown; guardian?: unknown; consents?: Record<string, unknown> } | null
  if (given?.ageBand === 'under18' && !isTick(given.guardian) && (raw as { type?: unknown }).type === 'session') {
    errors.push({ field: 'guardian', message: DETAIL_MESSAGES.guardian })
  }
  if (!isTick(given?.consents?.bookingCommunications)) {
    errors.push({
      field: 'consents.bookingCommunications',
      message: DETAIL_MESSAGES.bookingCommunications,
    })
  }
  if (errors.length || !parsed.success) {
    const seen = new Set<string>()
    return {
      ok: false,
      errors: errors.filter((error) => !seen.has(error.field) && Boolean(seen.add(error.field))),
    }
  }
  return { ok: true, value: parsed.data }
}
