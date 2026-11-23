import { err, ok } from '@/lib/result'
import { istDay } from '@/lib/time/ist'

import type { PreviewProposal, PrintVersion, ProposalError, ProposalSnapshot } from '../proposals'

import { notTypedYet } from './copy'
import type { ProposalDeps } from './deps'
import { mayPrintFees } from './fees'
import { readerUser } from './guard'
import { clientNameOf, findLead, findProposal, findVersion } from './load'
import type { PrinterError } from './print'
import { draftSnapshotOf, readSnapshot } from './snapshot'
import { sha256Of } from './tokens'

/**
 * The preview and the PDF (docs/17 §5). Both ask the fees rule first: while fees may not print,
 * neither is made (`fees-hidden`), so nothing is sent. The preview is the office's: placeholders
 * stay, and an empty part of the working copy shows as one with its name. The PDF is the client's
 * copy and is refused while a placeholder remains. Nothing is stored. For the staff who read
 * proposals, with the code.
 */

/** The working copy's empty parts as placeholders, so the office sees what is still to type. */
function withGapsShown(snapshot: ProposalSnapshot): ProposalSnapshot {
  const or = (text: string, part: Parameters<typeof notTypedYet>[0]) =>
    text.trim() ? text : notTypedYet(part)
  return {
    ...snapshot,
    clientName: or(snapshot.clientName, 'clientName'),
    title: or(snapshot.title, 'title'),
    subtitle: or(snapshot.subtitle, 'subtitle'),
    authorName: or(snapshot.authorName, 'preparedByName'),
    authorTitle: or(snapshot.authorTitle, 'preparedByTitle'),
    situation: or(snapshot.situation, 'situation'),
    approach: or(snapshot.approach, 'approach'),
    phases: snapshot.phases.length
      ? snapshot.phases
      : [{ name: notTypedYet('phases'), what: '', duration: '', outcome: '' }],
    measures: or(snapshot.measures, 'measures'),
    fees: snapshot.fees,
    nextStep: or(snapshot.nextStep, 'nextStep'),
  }
}

/** The printer's refusal as the actions' error. */
export function fromPrinter(error: PrinterError): ProposalError {
  return error
}

export function makePreviewProposal(deps: ProposalDeps): PreviewProposal {
  return async (req, input) => {
    if (!readerUser(req)) return err({ code: 'not-allowed' })
    const feesMayPrint = mayPrintFees(await deps.readFlags(req))
    if (!feesMayPrint) return err({ code: 'fees-hidden' })

    let snapshot: ProposalSnapshot | null
    if ('versionId' in input) {
      const version = await findVersion(req, input.versionId)
      if (!version) return err({ code: 'not-found' })
      snapshot = readSnapshot(version.document)
    } else {
      const proposal = await findProposal(req, input.proposalId)
      if (!proposal) return err({ code: 'not-found' })
      const lead = await findLead(req, proposal)
      snapshot = withGapsShown(
        draftSnapshotOf(proposal, {
          clientName: await clientNameOf(req, lead),
          date: istDay(deps.now()),
          reference: proposal.reference ?? null,
        }),
      )
    }
    if (!snapshot) return err({ code: 'not-found' })
    const page = await deps.printer.page(snapshot, { feesMayPrint })
    return page.ok ? ok({ html: page.value }) : err(fromPrinter(page.error))
  }
}

/** A version's file name: its printed reference, IIIC-P-24117-v2.pdf. */
export const pdfFilename = (snapshot: ProposalSnapshot) =>
  `${snapshot.reference.replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`

/** A version's PDF from its frozen snapshot, under the fees rule: the client's copy. */
export async function printSnapshot(
  req: Parameters<PrintVersion>[0],
  versionId: number,
  deps: ProposalDeps,
) {
  const feesMayPrint = mayPrintFees(await deps.readFlags(req))
  if (!feesMayPrint) return err({ code: 'fees-hidden' as const })
  const version = await findVersion(req, versionId)
  if (!version) return err({ code: 'not-found' as const })
  const snapshot = readSnapshot(version.document)
  if (!snapshot) return err({ code: 'not-found' as const })
  const pdf = await deps.printer.pdf(snapshot, { feesMayPrint })
  if (!pdf.ok) return err(fromPrinter(pdf.error))
  return ok({ version, pdf: pdf.value, filename: pdfFilename(snapshot), sha256: sha256Of(pdf.value) })
}

export function makePrintVersion(deps: ProposalDeps): PrintVersion {
  return async (req, { versionId }) => {
    if (!readerUser(req)) return err({ code: 'not-allowed' })
    const printed = await printSnapshot(req, versionId, deps)
    if (!printed.ok) return printed
    const { pdf, filename, sha256 } = printed.value
    return ok({ pdf, filename, sha256 })
  }
}
