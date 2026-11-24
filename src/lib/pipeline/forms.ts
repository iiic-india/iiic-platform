import { z } from 'zod'

import { toE164 } from '@/lib/phone'

import { toWebsite } from './fields'
import { TEAM_SIZE_BANDS, type TeamSizeBand } from './values'

/**
 * What the two public forms send, checked at the boundary before anything else happens (docs/03
 * F5 and F12; docs/17 §6; CLAUDE.md, Conventions: Zod at every boundary). The forms' server
 * actions (builder B) parse a submission with these and hand the result to `ReceiveEnquiry`
 * (src/lib/pipeline/leads.ts, builder A). A field's message is what the form shows beside it;
 * the words are checked against the writing standard with the form's other copy.
 *
 * The consent box has no default and must be ticked by the person (CLAUDE.md #9); the notice
 * version is the one the form showed, which the consent ledger checks was in force
 * (src/collections/Consents.ts). The spam guards (a trap field, the time the form was drawn, the
 * Turnstile token) are checked by the form's action, not here.
 *
 * Parsed on the server only: the phone check carries libphonenumber's full metadata, which no
 * public page's script should load (docs/12 §2). The browser shows the messages the action sends
 * back.
 */

export const FORM_MESSAGES = {
  company: 'Enter your company’s name.',
  institution: 'Enter the name of your university or institution.',
  website: 'Enter your website’s address, such as example.com, or leave it empty.',
  teamSize: 'Choose the size of your team.',
  sector: 'Enter your sector, such as manufacturing or healthcare.',
  name: 'Enter your name.',
  role: 'Enter your role.',
  email: 'Enter an email address, such as name@example.com.',
  phone: 'Enter a phone number. A number outside India needs its country code.',
  nature: 'Tell us what the partnership would be about.',
  tooLong: 'This is longer than the form takes. Please shorten it.',
  consent: 'Tick the box to let IIIC keep these details and reply to you.',
} as const

const M = FORM_MESSAGES

/** Text as typed, trimmed, required, within a length. */
const required = (message: string, max: number) =>
  z.string(message).trim().min(1, message).max(max, M.tooLong)

/** Text as typed, trimmed, optional: an empty field is no answer. */
const optional = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(max, M.tooLong).optional(),
  )

const email = z.string(M.email).trim().toLowerCase().max(254, M.email).pipe(z.email(M.email))

/** A phone number in any form, stored in E.164 (CLAUDE.md #8). */
const phone = z
  .string(M.phone)
  .trim()
  .min(1, M.phone)
  .max(30, M.phone)
  .transform((value, context) => {
    const e164 = toE164(value)
    if (e164) return e164
    context.addIssue({ code: 'custom', message: M.phone })
    return z.NEVER
  })

/** A website in one form, or nothing. */
const website = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .string(M.website)
    .max(200, M.website)
    .transform((value, context) => {
      const normal = toWebsite(value)
      if (normal) return normal
      context.addIssue({ code: 'custom', message: M.website })
      return z.NEVER
    })
    .optional(),
)

const teamSizeBand = z.enum(
  TEAM_SIZE_BANDS.map((band) => band.value) as [TeamSizeBand, ...TeamSizeBand[]],
  M.teamSize,
)

/** The consent box: sent only when ticked, with the value the form gives it. */
const consent = z.literal('yes', M.consent)

/** The notice version the form showed beside the box. */
const noticeVersion = z.coerce.number().int().positive()

/** The campaign tags on the link the person came by, if any; anything odd is dropped. */
export const UtmInput = z
  .object({
    source: optional(200),
    medium: optional(200),
    campaign: optional(200),
    term: optional(200),
    content: optional(200),
  })
  .partial()

/** The Team Map request (docs/03 F5 step 1). */
export const TeamMapRequestInput = z.object({
  company: required(M.company, 200),
  website,
  teamSizeBand,
  sector: required(M.sector, 100),
  name: required(M.name, 200),
  role: required(M.role, 100),
  email,
  mobile: phone,
  prompt: optional(2000),
  consent,
  noticeVersion,
})

export type TeamMapRequest = z.infer<typeof TeamMapRequestInput>

/** The partnership enquiry (docs/03 F12). */
export const PartnershipEnquiryInput = z.object({
  institution: required(M.institution, 200),
  name: required(M.name, 200),
  role: required(M.role, 100),
  email,
  phone,
  nature: required(M.nature, 2000),
  consent,
  noticeVersion,
})

export type PartnershipEnquiry = z.infer<typeof PartnershipEnquiryInput>
