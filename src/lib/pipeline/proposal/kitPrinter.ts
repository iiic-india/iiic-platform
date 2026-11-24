import type { DocumentError } from '@/lib/pdf/documents'
import type { ProposalError as RendererError } from '@/lib/pdf/proposal'
import { err, ok } from '@/lib/result'

import type { PrinterError, ProposalPrinter } from './print'

/**
 * The real printer (docs/17 §5): M3's renderer (src/lib/pdf/documents.ts, D-09) fills the kit's
 * `print/proposal.html` with a version's snapshot (field for field its `ProposalDocument`) and
 * prints it with Chromium, the serverless build on a Vercel deployment. The fees section prints
 * only while the fees rule allows (`feesMayPrint`, fees.ts) and is otherwise left out entirely.
 * The renderer, and with it the browser driver, is loaded only when something is printed, so the
 * Payload CLI and the requests that never print do not load it.
 *
 * Until the private documents bucket is set up (docs/16 §10; not among the validated settings
 * yet), nothing is stored: the PDF is printed again on each opening of the tracked link.
 */

/** The renderer's refusal as the printer's. A template that no longer matches is a fault. */
function fromRenderer(error: RendererError | DocumentError): PrinterError {
  switch (error.code) {
    case 'placeholders':
      return error
    case 'no-fees':
      return { code: 'incomplete', missing: ['fees'] }
    default:
      throw new Error(`The kit's proposal template could not be filled (${error.code}).`)
  }
}

export function kitProposalPrinter({ serverless }: { serverless: boolean }): ProposalPrinter {
  return {
    fake: false,
    async page(snapshot, { feesMayPrint }) {
      const { proposalPage } = await import('@/lib/pdf/documents')
      const page = await proposalPage(snapshot, { withFees: feesMayPrint })
      return page.ok ? ok(page.value) : err(fromRenderer(page.error))
    },
    async pdf(snapshot, { feesMayPrint }) {
      const { renderProposalPdf } = await import('@/lib/pdf/documents')
      const printed = await renderProposalPdf(snapshot, { withFees: feesMayPrint, serverless })
      return printed.ok ? ok(printed.value.pdf) : err(fromRenderer(printed.error))
    },
  }
}
