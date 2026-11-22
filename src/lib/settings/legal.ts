import { z } from 'zod'

import { formatPhone } from '@/lib/phone'
import { CONTACT } from '@/lib/site/contact'
import { formatIstDate } from '@/lib/time/ist'

/**
 * The legal information the site prints (docs/08 §3, §4; docs/12 §11, `/legal`), read from the
 * settings (docs/04 `settings`). Each detail is the value the owner entered, or, while it is
 * empty, the placeholder for the input in docs/09 that will supply it (D-56). The footer's legal
 * row and the legal information section of /legal draw these, and the placeholders report reads
 * them, so the report lists a placeholder exactly while the site shows it.
 */

type Placeholder = { readonly id: string; readonly what: string }

/** What each detail waits for, in the words the legal pages already use. */
export const LEGAL_PLACEHOLDERS = {
  legalName: {
    id: 'I-26',
    what: 'the proprietor’s legal name, exactly as on PAN and registrations',
  },
  tradeName: { id: 'I-26', what: 'the trade name exactly as registered' },
  address: { id: 'I-33', what: 'the address as it should print, with its PIN' },
  gstin: { id: 'I-05', what: 'the GSTIN' },
  grievanceOfficer: {
    id: 'I-21',
    what: 'the grievance officer’s name, designation and contact',
  },
  certIn: { id: 'I-27', what: 'name, email and phone' },
  darkPatternAudit: {
    id: 'I-22',
    what: 'the yearly certificate of compliance, shown here from 1 January 2027',
  },
} as const satisfies Record<string, Placeholder>

/** A placeholder as it is typed into text, which the site draws as the kit's chip. */
export const typed = ({ id, what }: Placeholder) => `[[TODO: ${what}, ${id}]]`

export type LegalInformation = {
  legalName?: string
  tradeName?: string
  address?: string
  gstin?: string
  gstStatus?: string
  customerCare: { email?: string; phone?: string; hours?: string }
  grievanceOfficer: { name?: string; designation?: string; email?: string; phone?: string }
  certIn: { name?: string; email?: string; phone?: string }
  /** The latest yearly dark-pattern self-audit, from 1 January 2027 (docs/08 §4). */
  darkPatternAudit?: { auditedOn: string; certificateUrl?: string }
}

/** Nothing supplied yet: every detail is its placeholder. */
export const NO_LEGAL_INFORMATION: LegalInformation = {
  customerCare: {},
  grievanceOfficer: {},
  certIn: {},
}

/** Text the owner typed, trimmed; anything else, or nothing, counts as empty. */
const detail = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined),
  z.string().optional(),
)

/** A media file's address, when the file came populated. */
const fileUrl = z.preprocess(
  (value) =>
    value && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string'
      ? (value as { url: string }).url
      : undefined,
  z.string().optional(),
)

const SettingsShape = z.object({
  legal: z
    .object({
      legalName: detail,
      tradeName: detail,
      address: detail,
      gstin: detail,
      gstStatus: detail,
      customerCare: z.object({ email: detail, phone: detail, hours: detail }).catch({}),
      grievanceOfficer: z
        .object({ name: detail, designation: detail, email: detail, phone: detail })
        .catch({}),
      certIn: z.object({ name: detail, email: detail, phone: detail }).catch({}),
    })
    .catch({ customerCare: {}, grievanceOfficer: {}, certIn: {} }),
  darkPatternAudits: z
    .array(z.object({ auditedOn: detail, certificate: fileUrl }).catch({}))
    .catch([]),
})

/** The legal information in the settings as the site reads it (src/globals/Settings.ts). */
export function toLegalInformation(settings: unknown): LegalInformation {
  const parsed = SettingsShape.safeParse(settings ?? {})
  if (!parsed.success) return NO_LEGAL_INFORMATION
  const { legal, darkPatternAudits } = parsed.data
  const latest = darkPatternAudits
    .filter((audit): audit is typeof audit & { auditedOn: string } =>
      Boolean(audit.auditedOn && !Number.isNaN(Date.parse(audit.auditedOn))),
    )
    .sort((a, b) => Date.parse(b.auditedOn) - Date.parse(a.auditedOn))[0]
  return {
    ...legal,
    ...(latest
      ? {
          darkPatternAudit: {
            auditedOn: latest.auditedOn,
            ...(latest.certificate ? { certificateUrl: latest.certificate } : {}),
          },
        }
      : {}),
  }
}

/**
 * The grievance officer as the site names them: once the name, the designation and an email or
 * a phone are all filled in, never in part (docs/08 §3: a person able to answer).
 */
export function grievanceOfficerLine({ grievanceOfficer }: LegalInformation): string | null {
  const { name, designation, email, phone } = grievanceOfficer
  if (!name || !designation || (!email && !phone)) return null
  return [name, designation, email, phone ? formatPhone(phone) : undefined]
    .filter(Boolean)
    .join(', ')
}

/** The CERT-In point of contact: name, email and phone, all three (docs/08 §1). */
export function certInLine({ certIn }: LegalInformation): string | null {
  const { name, email, phone } = certIn
  if (!name || !email || !phone) return null
  return `${name}, ${email}, ${formatPhone(phone)}`
}

/** The GSTIN, or while there is none, the registration status the owner entered. */
export function gstLine({ gstin, gstStatus }: LegalInformation): string | null {
  return gstin ?? gstStatus ?? null
}

/** An address typed over several lines, on one. */
export function addressLine(address: string): string {
  return address
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(', ')
}

export const LEGAL_INFORMATION_HEADING = 'Who runs this site'
export const LEGAL_INFORMATION_COLUMNS = { item: 'Item', detail: 'Detail' } as const

export type LegalRow = { item: string; text: string; link?: { href: string; label: string } }

/**
 * The rows of the legal information section of /legal (docs/12 §11): what docs/08 §4 asks a
 * seller to publish. Facts the docs already hold stand as they are (a sole proprietorship, the
 * platform domain, D-05; the contact details of D-31); every other detail is the settings'
 * value or its placeholder.
 */
export function legalRows(legal: LegalInformation): LegalRow[] {
  const care = legal.customerCare
  const audit = legal.darkPatternAudit
  return [
    {
      item: 'Trade name',
      text:
        legal.tradeName ??
        `Indian Institute of Image Catalysts (IIIC) ${typed(LEGAL_PLACEHOLDERS.tradeName)}`,
    },
    { item: 'Legal name', text: legal.legalName ?? typed(LEGAL_PLACEHOLDERS.legalName) },
    { item: 'Kind of business', text: 'Sole proprietorship' },
    {
      item: 'Address',
      text: legal.address
        ? addressLine(legal.address)
        : `${CONTACT.address} ${typed(LEGAL_PLACEHOLDERS.address)}`,
    },
    { item: 'Website', text: 'imagecatalysts.in' },
    { item: 'GSTIN', text: gstLine(legal) ?? typed(LEGAL_PLACEHOLDERS.gstin) },
    {
      item: 'Customer care',
      text: `${care.email ?? CONTACT.email} or ${care.phone ? formatPhone(care.phone) : CONTACT.phone}, ${care.hours ?? CONTACT.hours}`,
    },
    {
      item: 'Grievance officer',
      text: grievanceOfficerLine(legal) ?? typed(LEGAL_PLACEHOLDERS.grievanceOfficer),
    },
    {
      item: 'CERT-In point of contact',
      text: certInLine(legal) ?? typed(LEGAL_PLACEHOLDERS.certIn),
    },
    audit
      ? {
          item: 'Dark-pattern self-audit',
          text: `Audited on ${formatIstDate(new Date(audit.auditedOn))}`,
          ...(audit.certificateUrl
            ? { link: { href: audit.certificateUrl, label: 'Certificate of compliance' } }
            : {}),
        }
      : { item: 'Dark-pattern self-audit', text: typed(LEGAL_PLACEHOLDERS.darkPatternAudit) },
  ]
}

/** The details the footer's legal row names (docs/08 §3, §4), each null while it waits. */
export function footerLegal(legal: LegalInformation) {
  return {
    legalName: legal.legalName ?? null,
    gstin: legal.gstin ?? null,
    gstStatus: legal.gstin ? null : (legal.gstStatus ?? null),
    grievanceOfficer: grievanceOfficerLine(legal),
  }
}
