import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { formatIstDate } from '@/lib/time/ist'

import { CERTIFICATE_AWAITS, CERTIFICATE_STATEMENT } from './statement'

/**
 * The certificate's page: the kit's print template (src/brand/templates/print/certificate.html),
 * read from the kit, never copied, and filled field by field (docs/18 §4). Every value is escaped
 * as text except the QR code, which the server drew itself (src/lib/certificates/qr.ts). The
 * statement is the fixed one (statement.ts): the page says "Certificate of completion" and never
 * calls it a degree or diploma or implies recognition (CLAUDE.md #9). What IIIC has not supplied
 * yet is a placeholder with its input ID, and a page with one is never issued (CLAUDE.md #1).
 */

/** The signatory's name and title as printed (Settings → Certificates), I-51. */
export const SIGNATORY_INPUT = 'I-51'

export type Signatory = { name: string; title: string }

/** What one certificate's page prints. */
export type CertificateFields = {
  certificateId: string
  issuedAt: Date
  nameAsPrinted: string
  programmeName: string
  programmeDetails?: string | null
  signatory: Signatory | null
  verifyUrl: string
  qrSvg: string
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Text made safe to sit in HTML, as text. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character)
}

const todo = (what: string, input: string) =>
  `<span class="iiic-todo">[[TODO: ${escapeHtml(what)}, ${input}]]</span>`

/** The statement as one paragraph of text. */
export const STATEMENT_TEXT = CERTIFICATE_STATEMENT.join(' ')

/** The signatory from Settings, or null while either half is missing. */
export function signatoryFrom(
  settings: { signatoryName?: string | null; signatoryTitle?: string | null } | null | undefined,
): Signatory | null {
  const name = settings?.signatoryName?.trim()
  const title = settings?.signatoryTitle?.trim()
  return name && title ? { name, title } : null
}

/**
 * The template filled: each `{{field}}` replaced once from the values, unknown fields refused, so
 * a template that grows a field the code does not fill fails loudly rather than printing braces.
 */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match: string, name: string) => {
    const value = values[name]
    if (value === undefined) throw new Error(`The certificate template asks for {{${name}}}`)
    return value
  })
}

/** The values for one page, escaped, with the inputs it still waits for. */
export function certificateValues(fields: CertificateFields): {
  values: Record<string, string>
  waitingFor: string[]
} {
  const waitingFor: string[] = []
  const signatory = fields.signatory
  if (!signatory) waitingFor.push(SIGNATORY_INPUT)
  return {
    values: {
      certificate_id: escapeHtml(fields.certificateId),
      issue_date: escapeHtml(formatIstDate(fields.issuedAt)),
      learner_name: escapeHtml(fields.nameAsPrinted),
      programme_name: escapeHtml(fields.programmeName),
      programme_details: escapeHtml(fields.programmeDetails ?? ''),
      certificate_statement: escapeHtml(STATEMENT_TEXT),
      signatory_name: signatory
        ? escapeHtml(signatory.name)
        : todo('signatory’s name as printed', SIGNATORY_INPUT),
      signatory_title: signatory
        ? escapeHtml(signatory.title)
        : todo('signatory’s title as printed', SIGNATORY_INPUT),
      verify_url: escapeHtml(fields.verifyUrl),
      verify_qr_svg: fields.qrSvg,
    },
    waitingFor,
  }
}

/** One certificate's page from the template, and what it still waits for. */
export function fillCertificate(
  template: string,
  fields: CertificateFields,
): { html: string; waitingFor: string[] } {
  const { values, waitingFor } = certificateValues(fields)
  return { html: fillTemplate(template, values), waitingFor }
}

/** The statement's legal review (I-22): shown with every preview until it is cleared. */
export const STATEMENT_INPUT = CERTIFICATE_AWAITS

/** The kit's print folder in the deployment, which the template's relative addresses start from. */
export function certificateTemplateDir(): string {
  return path.join(process.cwd(), 'src', 'brand', 'templates', 'print')
}

/** The kit's certificate template, as the kit holds it. */
export async function readCertificateTemplate(): Promise<string> {
  return readFile(path.join(certificateTemplateDir(), 'certificate.html'), 'utf8')
}
