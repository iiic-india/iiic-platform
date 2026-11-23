import type {
  CheckboxField,
  CheckboxFieldValidation,
  Field,
  GlobalAfterChangeHook,
  GlobalConfig,
  NumberField,
  TextareaField,
  TextareaFieldValidation,
  TextField,
  TextFieldSingleValidation,
} from 'payload'
import { text, textarea } from 'payload/shared'

import { allow, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { paiseField } from '@/fields/numbers'
import { phoneField } from '@/lib/phone'
import { CLOCK_TIME, DEFAULT_QUIET_HOURS } from '@/lib/settings/quietHours'
import { revalidateSettings } from '@/lib/settings/revalidate'

/**
 * A detail is typed as it should print: while one is empty, the site draws its placeholder
 * itself (src/lib/settings/legal.ts), so the field never holds one.
 */
export const NO_PLACEHOLDER =
  'Type the detail itself. While this is empty, the site shows a placeholder on its own.'

/** The GSTIN's form: state code, PAN, entity number, Z, check character. */
export const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
/** The Udyam registration number's form, such as UDYAM-GJ-01-0000000. */
export const UDYAM = /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/
/** The IFSC's form: bank code, 0, branch code. */
export const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/

type Form = { pattern: RegExp; message: string }

/** No placeholder, then the detail's own form if it has one. */
export function checkDetail(value: unknown, form?: Form): true | string {
  if (typeof value !== 'string' || value.trim() === '') return true
  if (/\[\[|\]\]/.test(value)) return NO_PLACEHOLDER
  return !form || form.pattern.test(value) || form.message
}

/** Payload's own text check first, so that the length limit still holds. */
const textDetail =
  (form?: Form): TextFieldSingleValidation =>
  async (value, options) => {
    const base = await text(value, options)
    return base === true ? checkDetail(value, form) : base
  }

const linesDetail: TextareaFieldValidation = async (value, options) => {
  const base = await textarea(value, options)
  return base === true ? checkDetail(value) : base
}

/** A registration number is stored in capitals, whatever case it was typed in. */
const inCapitals = ({ value }: { value?: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value

function detail(
  name: string,
  label: string,
  options: { description?: string; form?: Form; capitals?: boolean } = {},
): TextField {
  return {
    name,
    type: 'text',
    label,
    maxLength: 300,
    validate: textDetail(options.form),
    ...(options.capitals ? { hooks: { beforeValidate: [inCapitals] } } : {}),
    admin: { description: options.description },
  }
}

function linesOfDetail(name: string, label: string, description: string): TextareaField {
  return {
    name,
    type: 'textarea',
    label,
    maxLength: 500,
    validate: linesDetail,
    admin: { description },
  }
}

const flag = (name: string, label: string, description: string): CheckboxField => ({
  name,
  type: 'checkbox',
  label,
  defaultValue: false,
  admin: { description },
})

/** Payment at booking shows the price before payment, so it needs the prices public (D-24). */
const needsPublicPrices: CheckboxFieldValidation = (value, { siblingData }) =>
  !value ||
  (siblingData as { pricesPublic?: unknown } | undefined)?.pricesPublic === true ||
  'Turn on “Prices are public” first: a booking shows its price before payment (D-21, D-24).'

const clockTime = (name: string, label: string, defaultValue: string): TextField => ({
  name,
  type: 'text',
  label,
  required: true,
  defaultValue,
  validate: async (value, options) => {
    const base = await text(value, options)
    if (base !== true) return base
    return (
      (typeof value === 'string' && CLOCK_TIME.test(value)) ||
      'Enter a time of day as HH:MM, such as 21:00.'
    )
  },
})

const amount = (
  name: string,
  label: string,
  description: string,
  defaultValue?: number,
): NumberField => ({
  name,
  type: 'number',
  label,
  min: 0,
  ...(defaultValue === undefined ? {} : { defaultValue }),
  admin: { description },
})

/** An owner's change reaches the footer, /legal and the flags at the next request. */
export const revalidateAfterChange: GlobalAfterChangeHook = ({ doc }) => {
  revalidateSettings()
  return doc
}

const legalInformation: Field = {
  name: 'legal',
  type: 'group',
  label: false,
  fields: [
    detail('legalName', 'Proprietor’s legal name', {
      description: 'Exactly as on PAN and registrations (I-26).',
    }),
    detail('tradeName', 'Trade name', { description: 'Exactly as registered (I-26).' }),
    linesOfDetail('address', 'Address', 'Exactly as it should print, with its PIN (I-33).'),
    {
      type: 'row',
      fields: [
        detail('gstin', 'GSTIN', {
          capitals: true,
          form: { pattern: GSTIN, message: 'Enter the 15-character GSTIN.' },
          description: 'I-05.',
        }),
        detail('gstStatus', 'GST registration status', {
          description: 'Only while there is no GSTIN: the status as it should print.',
        }),
        detail('udyam', 'Udyam registration number', {
          capitals: true,
          form: { pattern: UDYAM, message: 'Enter it as UDYAM-XX-00-0000000.' },
          description: 'For invoices (I-05).',
        }),
      ],
    },
    {
      name: 'customerCare',
      type: 'group',
      label: 'Customer care',
      admin: {
        description: 'Leave these empty to print the contact details the site already shows.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'email', type: 'email' },
            phoneField('phone'),
            detail('hours', 'Hours', { description: 'Such as Monday to Friday, 10 AM – 6 PM.' }),
          ],
        },
      ],
    },
    {
      name: 'grievanceOfficer',
      type: 'group',
      label: 'Grievance officer',
      admin: {
        description:
          'Printed once the name, the designation and an email or phone are all filled in (I-21).',
      },
      fields: [
        {
          type: 'row',
          fields: [
            detail('name', 'Name'),
            detail('designation', 'Designation'),
            { name: 'email', type: 'email' },
            phoneField('phone'),
          ],
        },
      ],
    },
    {
      name: 'certIn',
      type: 'group',
      label: 'CERT-In point of contact',
      admin: { description: 'Printed once the name, email and phone are all filled in (I-27).' },
      fields: [
        {
          type: 'row',
          fields: [detail('name', 'Name'), { name: 'email', type: 'email' }, phoneField('phone')],
        },
      ],
    },
  ],
}

const bankDetails: Field = {
  name: 'bank',
  type: 'group',
  label: false,
  fields: [
    detail('accountName', 'Account name'),
    { type: 'row', fields: [detail('bankName', 'Bank'), detail('branch', 'Branch')] },
    {
      type: 'row',
      fields: [
        detail('accountNumber', 'Account number'),
        detail('ifsc', 'IFSC', {
          capitals: true,
          form: { pattern: IFSC, message: 'Enter the 11-character IFSC.' },
        }),
      ],
    },
  ],
}

const bookingDefaults: Field = {
  name: 'booking',
  type: 'group',
  label: 'Booking defaults',
  admin: {
    description:
      'What a service uses unless it sets its own. The reschedule window waits on the cancellation rules (D-16).',
  },
  fields: [
    {
      type: 'row',
      fields: [
        amount('noticeHours', 'Notice (hours)', 'The earliest a time can be booked, from now.', 12),
        amount('horizonDays', 'Booking ahead (days)', 'How far ahead times are offered.', 14),
        amount('holdMinutes', 'Hold (minutes)', 'How long a time is held during payment.', 10),
      ],
    },
    {
      type: 'row',
      fields: [
        amount('bufferMinutes', 'Gap after a session (minutes)', 'Kept free after each session.'),
        amount(
          'rescheduleWindowHours',
          'Free reschedule until (hours before)',
          'Set with the cancellation rules (D-16).',
        ),
      ],
    },
  ],
}

/**
 * Money rules that are IIIC's to set (docs/05, Money; D-16). No default: while the threshold is
 * empty, every refund waits for an owner's approval, the safe reading of "approval above a
 * threshold" until IIIC names one (docs/16 §10).
 */
const moneyRules: Field = {
  name: 'money',
  type: 'group',
  label: 'Refunds',
  fields: [
    paiseField('refundApprovalThresholdPaise', 'Refunds above this need an owner (paise)', {
      description:
        'In paise: ₹1,500 is 150000. A refund above it waits for an owner’s approval. Empty: every refund does.',
    }),
  ],
}

const quietHours: Field = {
  name: 'quietHours',
  type: 'group',
  label: 'Quiet hours',
  admin: { description: 'No WhatsApp message or SMS goes out between these times, India time.' },
  fields: [
    {
      type: 'row',
      fields: [
        clockTime('start', 'From', DEFAULT_QUIET_HOURS.start),
        clockTime('end', 'Until', DEFAULT_QUIET_HOURS.end),
      ],
    },
  ],
}

const featureFlags: Field = {
  name: 'flags',
  type: 'group',
  label: false,
  fields: [
    flag(
      'pricesPublic',
      'Prices are public',
      'Shows prices on the site, in emails and in templates. Leave it off until IIIC publishes prices (D-21).',
    ),
    {
      ...flag(
        'payAtBooking',
        'Payment at booking',
        'Takes payment when a session is booked. Needs “Prices are public” first (D-24).',
      ),
      validate: needsPublicPrices,
    },
    flag('mapEnabled', 'The Map', 'The full Subjective Self Map (Release 2).'),
    flag('accountsEnabled', 'My IIIC accounts', 'Signing in to My IIIC (Release 2).'),
    flag(
      'bridgesEnabled',
      'Related programmes',
      'Suggestions of IIIC’s other programmes after a step (Release 2).',
    ),
  ],
}

const processorRegister: Field = {
  name: 'processors',
  type: 'array',
  label: 'Processor register',
  labels: { singular: 'Processor', plural: 'Processors' },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'name', type: 'text', required: true, maxLength: 100 },
        { name: 'location', type: 'text', maxLength: 200 },
        { name: 'contract', type: 'text', maxLength: 200 },
      ],
    },
    { name: 'holds', type: 'textarea', label: 'What it holds', maxLength: 1000 },
    {
      name: 'reviewedOn',
      type: 'date',
      label: 'Last reviewed',
      admin: { date: { pickerAppearance: 'dayOnly' } },
    },
  ],
}

const darkPatternAudits: Field = {
  name: 'darkPatternAudits',
  type: 'array',
  label: 'Audits',
  labels: { singular: 'Audit', plural: 'Audits' },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'auditedOn',
          type: 'date',
          label: 'Audited on',
          required: true,
          admin: { date: { pickerAppearance: 'dayOnly' } },
        },
        { name: 'auditedBy', type: 'text', label: 'Audited by', required: true, maxLength: 200 },
      ],
    },
    { name: 'notes', type: 'textarea', maxLength: 2000 },
    {
      name: 'certificate',
      type: 'upload',
      relationTo: 'media',
      label: 'Certificate of compliance',
      admin: { description: 'Shown on /legal with the date of the audit.' },
    },
  ],
}

/**
 * Who signs IIIC's certificates (D-39; src/brand/templates/print/certificate.html), exactly as it
 * should print. IIIC's to supply (docs/18 §9): while either is empty, no certificate is issued,
 * and the preview shows a placeholder in its place (CLAUDE.md #1).
 */
const certificateSignatory: Field = {
  name: 'certificates',
  type: 'group',
  label: 'Signatory',
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'signatoryName', type: 'text', label: 'Name, as printed', maxLength: 120 },
        { name: 'signatoryTitle', type: 'text', label: 'Title, as printed', maxLength: 120 },
      ],
    },
  ],
}

/**
 * The settings (docs/04 `settings`; docs/05, Settings): owners only. The legal information the
 * site prints, the bank details for invoices, the booking defaults, the quiet hours, the
 * feature flags, the processor register and the yearly dark-pattern audit. Pages read the legal
 * information and the flags on the server, those fields only (src/lib/settings/); every change
 * is in the audit log (src/plugins/auditLog.ts).
 */
export const Settings: GlobalConfig = {
  slug: 'settings',
  label: 'Platform settings',
  typescript: { interface: 'PlatformSettings' },
  admin: {
    group: 'Settings',
    hidden: ({ user }) => !hasRole(user, ...POLICY.settings.read.roles),
    description:
      'What the site prints about IIIC, the rules it runs by, and the switches for what is not live yet.',
  },
  access: {
    read: allow(POLICY.settings.read),
    update: allow(POLICY.settings.update),
  },
  hooks: { afterChange: [revalidateAfterChange] },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Legal information',
          description:
            'Printed on /legal and in the footer. Leave a detail empty until IIIC has it: the site shows a placeholder in its place.',
          fields: [legalInformation],
        },
        {
          label: 'Bank details',
          description: 'For invoices (I-06). Never shown on the site.',
          fields: [bankDetails],
        },
        { label: 'Bookings and messages', fields: [bookingDefaults, quietHours] },
        {
          label: 'Money',
          description: 'Rules for refunds. Prices, GST rates and SAC codes are set per service.',
          fields: [moneyRules],
        },
        { label: 'Feature flags', fields: [featureFlags] },
        {
          label: 'Certificates',
          description:
            'Who signs IIIC’s certificates. No certificate is issued until both are entered.',
          fields: [certificateSignatory],
        },
        {
          label: 'Processors',
          description:
            'Every company that handles personal data for IIIC: what it holds, where, and under which contract.',
          fields: [processorRegister],
        },
        {
          label: 'Dark-pattern audit',
          description:
            'The yearly self-audit against the dark-pattern rules, from 1 January 2027. The latest is printed on /legal.',
          fields: [darkPatternAudits],
        },
      ],
    },
  ],
}
