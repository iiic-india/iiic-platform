import type { Paise } from '@/lib/payments/money'
import { err, type Result } from '@/lib/result'

import { formatDay, formatRupees } from './format'
import { escapeHtml, fillTemplate, markup, type MergeError } from './merge'

/**
 * A consultancy proposal printed through the kit's `proposal.html` (D-09). This is the renderer
 * only: proposals, their versions and their sending are M4's (docs/10), which fills this type from
 * its own collection. Pure: the typed merge fields in, the filled page out.
 *
 * The fee rows print amounts, so a proposal is made only while prices are public (D-21: no price
 * on any page, email or template while `prices_public` is off). Whether a proposal's fees, quoted
 * to one organisation, stand outside that rule as a payment link's amount does (D-24) is
 * proposed for IIIC to decide; until then the caller passes the flag and is refused while it is
 * off.
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

export type ProposalError = MergeError | { code: 'prices-hidden' } | { code: 'no-fees' }

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

/** The kit's proposal page filled with one proposal; the template comes in as text. */
export function proposalHtml(
  template: string,
  doc: ProposalDocument,
  { pricesPublic }: { pricesPublic: boolean },
): Result<string, ProposalError> {
  if (!pricesPublic) return err({ code: 'prices-hidden' })
  if (!doc.fees.length) return err({ code: 'no-fees' })
  const total = doc.fees.reduce((sum, fee) => sum + fee.amountPaise, 0)
  return fillTemplate(template, {
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
    fee_rows: markup(doc.fees.map(feeRow).join('')),
    fee_total: formatRupees(total),
    next_step: doc.nextStep,
  })
}
