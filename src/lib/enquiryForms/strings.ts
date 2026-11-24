import { FORM_ANCHORS } from '@/blocks/pageBlocks'
import { CONTACT } from '@/lib/site/contact'

/**
 * Every word the two public forms show (docs/03 F5, F12; docs/17 §6), in one place for the
 * en-IN locale, checked against src/brand/VOICE.md. The field messages are the boundary's own
 * (FORM_MESSAGES in src/lib/pipeline/forms.ts). The consent box's words are not here: they are
 * the notice in force, as Content → Consent texts holds it (I-22). Until IIIC approves the
 * forms' and the acknowledgements' words (I-41), each form carries the candidate marker.
 *
 * No server-only import: the forms' client components read these.
 */

/** The public forms, by the enquiry kind they make (src/lib/pipeline/values.ts). */
export type EnquiryFormKind = 'teamMap' | 'partnership'

/** The office's address where a form cannot help: the same as the contact section's. */
export const OFFICE_EMAIL = CONTACT.email

/** The proposal call, as every consultancy page books it (src/content/starter/organisations.ts). */
export const PROPOSAL_CALL = { label: 'Book a proposal call', href: '/book/call' } as const

/** Where the privacy notice is, beside the consent box. */
export const PRIVACY_NOTICE = { label: 'Read the privacy notice', href: '/privacy' } as const

/** A field as the form draws it: its name in the submission, its label, and how it is typed. */
export type FormField = {
  name: string
  label: string
  type: 'text' | 'email' | 'tel' | 'url' | 'textarea' | 'select'
  required: boolean
  autoComplete?: string
  /** Across the grid's two columns. */
  full?: boolean
  maxLength: number
  /** A line under the field on how to answer it. */
  help?: string
}

const PHONE_HELP = 'A number outside India needs its country code, such as +44.'

const optional = (label: string) => `${label} (optional)`

export const TEAM_MAP_FIELDS: readonly FormField[] = [
  {
    name: 'company',
    label: 'Company',
    type: 'text',
    required: true,
    autoComplete: 'organization',
    maxLength: 200,
  },
  {
    name: 'website',
    label: optional('Website'),
    type: 'url',
    required: false,
    autoComplete: 'url',
    maxLength: 200,
  },
  { name: 'teamSizeBand', label: 'Team size', type: 'select', required: true, maxLength: 20 },
  { name: 'sector', label: 'Sector', type: 'text', required: true, maxLength: 100 },
  {
    name: 'name',
    label: 'Your name',
    type: 'text',
    required: true,
    autoComplete: 'name',
    maxLength: 200,
  },
  {
    name: 'role',
    label: 'Your role',
    type: 'text',
    required: true,
    autoComplete: 'organization-title',
    maxLength: 100,
  },
  {
    name: 'email',
    label: 'Work email',
    type: 'email',
    required: true,
    autoComplete: 'email',
    maxLength: 254,
  },
  {
    name: 'mobile',
    label: 'Mobile number',
    type: 'tel',
    required: true,
    autoComplete: 'tel',
    maxLength: 30,
    help: PHONE_HELP,
  },
  {
    name: 'prompt',
    label: optional('What prompted the request'),
    type: 'textarea',
    required: false,
    full: true,
    maxLength: 2000,
  },
]

export const PARTNERSHIP_FIELDS: readonly FormField[] = [
  {
    name: 'institution',
    label: 'University or institution',
    type: 'text',
    required: true,
    autoComplete: 'organization',
    full: true,
    maxLength: 200,
  },
  {
    name: 'name',
    label: 'Your name',
    type: 'text',
    required: true,
    autoComplete: 'name',
    maxLength: 200,
  },
  {
    name: 'role',
    label: 'Your role',
    type: 'text',
    required: true,
    autoComplete: 'organization-title',
    maxLength: 100,
  },
  {
    name: 'email',
    label: 'Email',
    type: 'email',
    required: true,
    autoComplete: 'email',
    maxLength: 254,
  },
  {
    name: 'phone',
    label: 'Phone number',
    type: 'tel',
    required: true,
    autoComplete: 'tel',
    maxLength: 30,
    help: PHONE_HELP,
  },
  {
    name: 'nature',
    label: 'What the partnership would be about',
    type: 'textarea',
    required: true,
    full: true,
    maxLength: 2000,
  },
]

export const FORM_COPY = {
  teamMap: {
    anchor: FORM_ANCHORS.teamMapRequest,
    /** The section's heading: the action the hero and the organisations page name. */
    heading: 'Request a Team Map',
    submit: 'Send the request',
    fields: TEAM_MAP_FIELDS,
    /** The prefix of the fields' ids, so that two forms on one page never share an id. */
    idPrefix: 'tm',
    acknowledgement: {
      heading: 'Request received',
      lines: [
        'Your Team Map request has reached IIIC.',
        'The office will reply within two working days.',
      ],
      /** The proposal call can be booked meanwhile (docs/17 §6). */
      callLine: 'You can book the proposal call now, before the office replies.',
    },
  },
  partnership: {
    anchor: FORM_ANCHORS.partnershipEnquiry,
    heading: 'Partner with IIIC',
    submit: 'Send the enquiry',
    fields: PARTNERSHIP_FIELDS,
    idPrefix: 'pe',
    acknowledgement: {
      heading: 'Enquiry received',
      lines: [
        'Your partnership enquiry has reached IIIC.',
        'The office will reply within two working days.',
      ],
      callLine: null,
    },
  },
} as const satisfies Record<EnquiryFormKind, unknown>

/** The choice a select starts on, which is no answer. */
export const CHOOSE = 'Choose one'

/** The heading of the error summary, as the kit's pattern has it: "Check 1 answer". */
export function checkAnswers(count: number): string {
  return `Check ${count} ${count === 1 ? 'answer' : 'answers'}`
}

/** The error summary's heading when the form was not taken for a reason other than an answer. */
export const NOT_SENT = 'The form was not sent'

/** Why a form that was filled in correctly was not taken, in the person's terms. */
export const REFUSALS = {
  turnstile: 'The spam check did not go through. Send the form again.',
  limit: `IIIC already has your requests, and the office will reply to them. To add something, write to ${OFFICE_EMAIL}.`,
  'notice-changed':
    'The consent wording changed after this page opened. Read it again below and tick the box to send the form.',
  'no-notice': `This form cannot be sent just now. Write to ${OFFICE_EMAIL} instead.`,
  // On a preview of the site, whose visitors are IIIC's team (src/lib/enquiryForms/deployment.ts).
  preview: `This preview of the site sends no forms. Write to ${OFFICE_EMAIL} instead.`,
  failed: `The form was not sent because of a fault on IIIC’s side. Send it again, or write to ${OFFICE_EMAIL}.`,
} as const

export type Refusal = keyof typeof REFUSALS

/** Beside Turnstile's widget, for a browser that runs no script. */
export const TURNSTILE_NOSCRIPT = `The spam check on this form needs JavaScript. Without it, write to ${OFFICE_EMAIL}.`

/** The trap field's label: nobody sees it, and anything typed in it marks a robot. */
export const TRAP_LABEL = 'Leave this empty'

/**
 * The forms' words, acknowledgements included, are candidates until IIIC approves them (I-41):
 * each form's section carries the candidate marker, and the placeholders report lists it.
 */
export const FORMS_COPY_STATUS: 'approved' | 'candidate' = 'candidate'

/** What a form shows in place of its fields while no consent text is in force (docs/17 §6). */
export const NO_NOTICE_PLACEHOLDER = { id: 'I-22', what: 'the enquiry consent text' } as const
