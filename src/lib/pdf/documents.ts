import { err, ok, type Result } from '@/lib/result'

import { invoiceHtml, type InvoiceDocument, type InvoiceError } from './invoice'
import { placeholdersIn } from './merge'
import {
  proposalHtml,
  type ProposalDocument,
  type ProposalError,
  type ProposalPrint,
} from './proposal'
import { renderPdf, type RenderOptions } from './render'
import { printTemplateDir, readPrintTemplate, selfContained } from './templates'

/**
 * A document from its typed fields to a PDF: the kit's template filled (pure), made
 * self-contained, and printed by Chromium. A document that still holds a placeholder is refused
 * (`placeholders`), with what it waits for, so nothing unsupplied reaches a client (CLAUDE.md #1);
 * the preview path keeps them, for the office and the tests.
 */

export type Rendered = { html: string; pdf: Uint8Array }

export type DocumentError =
  InvoiceError | ProposalError | { code: 'placeholders'; waitingFor: string[] }

/** The filled, self-contained page of an invoice, placeholders and all. */
export async function invoicePage(doc: InvoiceDocument): Promise<Result<string, InvoiceError>> {
  const filled = invoiceHtml(await readPrintTemplate('invoice'), doc)
  if (!filled.ok) return filled
  return ok(await selfContained(filled.value, printTemplateDir()))
}

/** The filled, self-contained page of a proposal, with or without its fees section. */
export async function proposalPage(
  doc: ProposalDocument,
  print: ProposalPrint,
): Promise<Result<string, ProposalError>> {
  const filled = proposalHtml(await readPrintTemplate('proposal'), doc, print)
  if (!filled.ok) return filled
  return ok(await selfContained(filled.value, printTemplateDir()))
}

async function toPdf(
  page: Result<string, InvoiceError | ProposalError>,
  options: RenderOptions & { allowPlaceholders?: boolean },
): Promise<Result<Rendered, DocumentError>> {
  if (!page.ok) return page
  const waitingFor = placeholdersIn(page.value)
  if (waitingFor.length && !options.allowPlaceholders) {
    return err({ code: 'placeholders', waitingFor })
  }
  return ok({ html: page.value, pdf: await renderPdf(page.value, options) })
}

/** An invoice, credit note or voucher as a PDF. */
export async function renderInvoicePdf(
  doc: InvoiceDocument,
  options: RenderOptions & { allowPlaceholders?: boolean },
): Promise<Result<Rendered, DocumentError>> {
  return toPdf(await invoicePage(doc), options)
}

/** A proposal as a PDF (M4 calls this from its proposal versions). */
export async function renderProposalPdf(
  doc: ProposalDocument,
  options: RenderOptions & ProposalPrint & { allowPlaceholders?: boolean },
): Promise<Result<Rendered, DocumentError>> {
  return toPdf(await proposalPage(doc, { withFees: options.withFees }), options)
}
