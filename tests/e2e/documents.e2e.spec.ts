import { expect, test } from '@playwright/test'
import { extractText, getDocumentProxy } from 'unpdf'

import { renderInvoicePdf, renderProposalPdf } from '../../src/lib/pdf/documents'
import {
  FAKE_INVOICE,
  FAKE_INVOICE_PRINTS,
  FAKE_PROPOSAL,
  FAKE_PROPOSAL_FEE_PRINTS as FEE_PRINTS,
  FAKE_PROPOSAL_PRINTS,
} from '../helpers/documents'

// docs/10 M3, "Done when": an invoice PDF matches the print template. A fake document is filled
// into src/brand/templates/print/invoice.html, printed by the same renderer B3 uses (Playwright's
// Chromium here, the serverless build on Vercel), and the PDF itself is read back: it holds every
// merge value, no {{field}} and no placeholder, on A4. Proposals (D-09) the same way. These run
// here because CI installs Chromium for the end-to-end step only; they need no page of the app.

test.describe.configure({ mode: 'serial' })
test.beforeEach(() => {
  // The PDF is the same whatever the viewport: one run is enough.
  test.skip(test.info().project.name !== 'desktop', 'Runs once, in the desktop project')
})

/** A4 in PDF points. */
const A4 = { width: 595.28, height: 841.89 }

/**
 * Text compared without spaces or case: the kit sets kickers and headings in spaced capitals
 * ("T A X I N V O I C E"), which a PDF's text layer keeps as separate letters.
 */
const squash = (text: string) => text.replace(/\s+/g, '').toLowerCase()

async function readPdf(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(bytes)
  const { text } = await extractText(pdf, { mergePages: true })
  const first = await pdf.getPage(1)
  const [, , width, height] = first.view as [number, number, number, number]
  return { pages: pdf.numPages, text: squash(text), width, height }
}

test('the invoice PDF prints every value of the print template, and nothing unfilled', async () => {
  const rendered = await renderInvoicePdf(FAKE_INVOICE, { serverless: false })
  if (!rendered.ok) throw new Error(rendered.error.code)
  const pdf = await readPdf(rendered.value.pdf)
  for (const value of FAKE_INVOICE_PRINTS) expect(pdf.text).toContain(squash(value))
  expect(pdf.text).not.toContain('{{')
  expect(pdf.text).not.toContain('[[todo')
  expect(pdf.width).toBeCloseTo(A4.width, 0)
  expect(pdf.height).toBeCloseTo(A4.height, 0)
})

test('an invoice that waits for a fact is not printed for a client', async () => {
  const rendered = await renderInvoicePdf(
    { ...FAKE_INVOICE, supplier: { ...FAKE_INVOICE.supplier, gstin: null } },
    { serverless: false },
  )
  expect(rendered.ok).toBe(false)
  if (!rendered.ok) expect(rendered.error.code).toBe('placeholders')
})

test('the proposal PDF prints its cover and every value', async () => {
  const rendered = await renderProposalPdf(FAKE_PROPOSAL, {
    serverless: false,
    withFees: true,
  })
  if (!rendered.ok) throw new Error(rendered.error.code)
  const pdf = await readPdf(rendered.value.pdf)
  // The cover is a page of its own; the body flows after it.
  expect(pdf.pages).toBeGreaterThanOrEqual(2)
  for (const value of FAKE_PROPOSAL_PRINTS) expect(pdf.text).toContain(squash(value))
  expect(pdf.text).not.toContain('{{')
})

test('the proposal PDF without fees prints the rest and no fee, amount or total (D-21)', async () => {
  const rendered = await renderProposalPdf(FAKE_PROPOSAL, {
    serverless: false,
    withFees: false,
  })
  if (!rendered.ok) throw new Error(rendered.error.code)
  const pdf = await readPdf(rendered.value.pdf)
  for (const value of FAKE_PROPOSAL_PRINTS.filter((value) => !FEE_PRINTS.includes(value))) {
    expect(pdf.text).toContain(squash(value))
  }
  for (const absent of [...FEE_PRINTS, 'Investment', '₹', 'Total, excluding GST']) {
    expect(pdf.text).not.toContain(squash(absent))
  }
  expect(pdf.text).not.toContain('{{')
})
