import type { Paise } from '@/lib/payments/money'
import { err, ok, type Result } from '@/lib/result'

import { formatDay, formatRupees } from './format'
import { escapeHtml, fillTemplate, markup, withoutComments, type MergeError } from './merge'

/**
 * A consultancy proposal printed through the kit's `proposal.html` (D-09). This is the renderer
 * only: proposals, their versions and their sending are M4's (docs/10), which fills this type from
 * its own collection. Pure: the typed merge fields in, the filled page out.
 *
 * The caller says whether the fees section prints (`withFees`, from M4's one fees rule,
 * src/lib/pipeline/proposal/fees.ts). While prices are hidden (D-21: no price on any page, email
 * or template while `prices_public` is off; the owner's ruling of 23 November 2026) the section is
 * left out entirely: its heading, the fee table and the total go, and the next step takes its
 * number. Nothing is printed in its place. With fees, a proposal without one is refused.
 */

export type ProposalPhase = { name: string; what: string; duration: string; outcome: string }

export type ProposalFee = { item: string; amountPaise: Paise }

export type ProposalDocument = {
  clientName: string
  title: string
  subtitle: string
  /** YYYY-MM-DD. */
  date: string
  authorName: string
  authorTitle: string
  reference: string
  situation: string
  approach: string
  phases: ProposalPhase[]
  measures: string
  fees: ProposalFee[]
  nextStep: string
}

export type ProposalError =
  MergeError | { code: 'no-fees' } | { code: 'template-changed'; piece: string }

/** Whether the fees section prints: M4's fees rule answers it, nothing here decides it. */
export type ProposalPrint = { withFees: boolean }

const cell = (text: string) => `<td>${escapeHtml(text)}</td>`

function phaseRow(phase: ProposalPhase): string {
  return (
    `<tr><td><strong>${escapeHtml(phase.name)}</strong></td>` +
    `${cell(phase.what)}${cell(phase.duration)}${cell(phase.outcome)}</tr>`
  )
}

function feeRow(fee: ProposalFee): string {
  return `<tr>${cell(fee.item)}<td class="num">${formatRupees(fee.amountPaise)}</td></tr>`
}

/** The kit's fees section starts here and ends where the next step's heading begins. */
const FEES_HEADING = '<h2>4. Investment</h2>'
const NEXT_STEP_HEADING = '<h2>5. Next step</h2>'
/** The next step's heading once the fees section is left out, so the numbers run on. */
const NEXT_STEP_WITHOUT_FEES = '<h2>4. Next step</h2>'
/** What the section must hold, so a change to the kit fails here instead of printing a price. */
const FEES_FIELDS = ['{{fee_rows}}', '{{fee_total}}'] as const

const once = (text: string, piece: string) => {
  const first = text.indexOf(piece)
  return first >= 0 && text.indexOf(piece, first + 1) < 0 ? first : -1
}

/**
 * The template without its fees section: everything from the fees' heading to the next step's
 * heading goes, and the next step is numbered 4. Refused (`template-changed`) unless each heading
 * is there exactly once, in that order, and the fee fields are between them and nowhere else.
 */
export function withoutFeesSection(template: string): Result<string, ProposalError> {
  const body = withoutComments(template)
  const start = once(body, FEES_HEADING)
  const end = once(body, NEXT_STEP_HEADING)
  if (start < 0) return err({ code: 'template-changed', piece: FEES_HEADING })
  if (end < 0 || end < start) return err({ code: 'template-changed', piece: NEXT_STEP_HEADING })
  const section = body.slice(start, end)
  for (const field of FEES_FIELDS) {
    if (once(body, field) < 0 || !section.includes(field)) {
      return err({ code: 'template-changed', piece: field })
    }
  }
  const rest = body.slice(end + NEXT_STEP_HEADING.length)
  return ok(body.slice(0, start) + NEXT_STEP_WITHOUT_FEES + rest)
}

/** The kit's proposal page filled with one proposal; the template comes in as text. */
export function proposalHtml(
  template: string,
  doc: ProposalDocument,
  { withFees }: ProposalPrint,
): Result<string, ProposalError> {
  const values = {
    client_name: doc.clientName,
    proposal_title: doc.title,
    proposal_subtitle: doc.subtitle,
    date: formatDay(doc.date),
    author_name: doc.authorName,
    author_title: doc.authorTitle,
    reference: doc.reference,
    situation: doc.situation,
    approach: doc.approach,
    phase_rows: markup(doc.phases.map(phaseRow).join('')),
    measures: doc.measures,
    next_step: doc.nextStep,
  }
  if (!withFees) {
    const page = withoutFeesSection(template)
    if (!page.ok) return page
    return fillTemplate(page.value, values)
  }
  if (!doc.fees.length) return err({ code: 'no-fees' })
  const total = doc.fees.reduce((sum, fee) => sum + fee.amountPaise, 0)
  return fillTemplate(template, {
    ...values,
    fee_rows: markup(doc.fees.map(feeRow).join('')),
    fee_total: formatRupees(total),
  })
}
