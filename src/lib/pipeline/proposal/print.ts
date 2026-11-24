import { err, ok, type Result } from '@/lib/result'

import type { ProposalSnapshot } from '../proposals'

/**
 * The printer port (docs/17 §5, §12). The real printer is M3's renderer (`kitPrinter.ts`, through
 * `proposalPage` and `renderProposalPdf` in src/lib/pdf/documents.ts, D-09): it fills the kit's
 * `print/proposal.html` and prints it with Chromium, and refuses a PDF that still holds a
 * placeholder. The fake below stands in for it in the tests.
 *
 * The caller asks the fees rule (fees.ts) and passes its answer on: while `feesMayPrint` is false
 * the page and the PDF leave the fees section out entirely, and nothing takes its place.
 */

export type PrinterError =
  { code: 'placeholders'; waitingFor: string[] } | { code: 'incomplete'; missing: string[] }

export type PrintFlags = { feesMayPrint: boolean }

export type ProposalPrinter = {
  /** Whether this is the stand-in (the admin says so beside the preview). */
  readonly fake: boolean
  /** The filled page, placeholders kept: the office's preview. */
  page(snapshot: ProposalSnapshot, flags: PrintFlags): Promise<Result<string, PrinterError>>
  /** The PDF the client receives: refused while a placeholder remains. */
  pdf(snapshot: ProposalSnapshot, flags: PrintFlags): Promise<Result<Uint8Array, PrinterError>>
}

/** A placeholder as the kit's templates write it (src/lib/pdf/merge.ts on m3/join). */
const TODO = /\[\[TODO: [^\]]+\]\]/g

/** Every placeholder in the words a snapshot prints (the fee items only while fees print). */
export function placeholdersInSnapshot(
  snapshot: ProposalSnapshot,
  { feesMayPrint }: PrintFlags,
): string[] {
  const words = [
    snapshot.clientName,
    snapshot.title,
    snapshot.subtitle,
    snapshot.authorName,
    snapshot.authorTitle,
    snapshot.reference,
    snapshot.situation,
    snapshot.approach,
    ...snapshot.phases.flatMap((phase) => [phase.name, phase.what, phase.duration, phase.outcome]),
    snapshot.measures,
    ...(feesMayPrint ? snapshot.fees.map((fee) => fee.item) : []),
    snapshot.nextStep,
  ]
  return [...new Set(words.flatMap((text) => text.match(TODO) ?? []))]
}

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const GROUPING = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

/** 12345650 paise → "1,23,456.50", as the template's "(₹)" columns print it. */
export function rupees(paise: number): string {
  return `${GROUPING.format(Math.floor(paise / 100))}.${String(paise % 100).padStart(2, '0')}`
}

/** The fees section as the fake prints it: the items, their amounts and the total. */
function feeLines(snapshot: ProposalSnapshot): string[] {
  const total = snapshot.fees.reduce((sum, fee) => sum + fee.amountPaise, 0)
  return [
    'Fees (₹)',
    ...snapshot.fees.map((fee) => `${fee.item}: ${rupees(fee.amountPaise)}`),
    `Total, excluding GST: ${rupees(total)}`,
    '',
  ]
}

/**
 * The snapshot as plain lines, in the template's order: what the fake prints. Without fees, the
 * fees section is left out, as the kit's renderer leaves it out.
 */
function linesOf(snapshot: ProposalSnapshot, { feesMayPrint }: PrintFlags): string[] {
  return [
    snapshot.title,
    snapshot.subtitle,
    `Prepared for ${snapshot.clientName}`,
    `${snapshot.reference} · ${snapshot.date}`,
    `Prepared by ${snapshot.authorName}, ${snapshot.authorTitle}`,
    '',
    'The situation',
    snapshot.situation,
    '',
    'The approach',
    snapshot.approach,
    '',
    'Phases',
    ...snapshot.phases.map(
      (phase) => `${phase.name} (${phase.duration}): ${phase.what} Outcome: ${phase.outcome}`,
    ),
    '',
    'How progress is measured',
    snapshot.measures,
    '',
    ...(feesMayPrint ? feeLines(snapshot) : []),
    'The next step',
    snapshot.nextStep,
  ]
}

/** The words the stand-in prints at the top of its page, so no one mistakes it for the kit's. */
export const FAKE_PRINT_NOTE = 'Printed by the stand-in printer, not the kit’s template.'

/** The stand-in's page: the snapshot's words, escaped, in plain HTML. */
function fakePage(snapshot: ProposalSnapshot, flags: PrintFlags): string {
  const body = linesOf(snapshot, flags)
    .map((line) => (line === '' ? '' : `<p>${escapeHtml(line)}</p>`))
    .join('\n')
  return `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><title>${escapeHtml(
    snapshot.reference || snapshot.title,
  )}</title></head><body><p><em>${escapeHtml(FAKE_PRINT_NOTE)}</em></p>\n${body}</body></html>`
}

/** Text a PDF's built-in font can draw: Latin-1 only, with its three special characters escaped. */
function pdfText(line: string): string {
  return line
    .replace(/₹/g, 'Rs.')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/·/g, '-')
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function wrap(line: string, width: number): string[] {
  if (line.length <= width) return [line]
  const out: string[] = []
  let rest = line
  while (rest.length > width) {
    const cut = rest.lastIndexOf(' ', width)
    const at = cut > 0 ? cut : width
    out.push(rest.slice(0, at))
    rest = rest.slice(at).trimStart()
  }
  out.push(rest)
  return out
}

const LINES_PER_PAGE = 54

/** A plain, valid PDF of lines of text, in Helvetica on A4: the stand-in's PDF. */
export function plainPdf(lines: readonly string[]): Uint8Array {
  const wrapped = [FAKE_PRINT_NOTE, '', ...lines].flatMap((line) => wrap(pdfText(line), 92))
  const pages: string[][] = []
  for (let at = 0; at < wrapped.length; at += LINES_PER_PAGE) {
    pages.push(wrapped.slice(at, at + LINES_PER_PAGE))
  }
  // Objects: 1 catalog, 2 pages, 3 font, then a page and its contents for each page.
  const objects: string[] = []
  const kids = pages.map((_, index) => `${4 + index * 2} 0 R`).join(' ')
  objects.push('<< /Type /Catalog /Pages 2 0 R >>')
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`)
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  pages.forEach((pageLines, index) => {
    const stream = `BT /F1 10 Tf 14 TL 50 800 Td ${pageLines.map((line) => `(${line}) Tj T*`).join(' ')} ET`
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
    )
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  })
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(out.length)
    out += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  out += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}

/**
 * The stand-in printer, for the tests: no browser, plain lines. It keeps the renderer's rules: the
 * fees section only while fees may print, a proposal with fees to print and none typed refused as
 * `incomplete`, and a PDF holding a placeholder refused.
 */
export function fakeProposalPrinter(): ProposalPrinter {
  return {
    fake: true,
    async page(snapshot, flags) {
      if (flags.feesMayPrint && !snapshot.fees.length) {
        return err({ code: 'incomplete', missing: ['fees'] })
      }
      return ok(fakePage(snapshot, flags))
    },
    async pdf(snapshot, flags) {
      if (flags.feesMayPrint && !snapshot.fees.length) {
        return err({ code: 'incomplete', missing: ['fees'] })
      }
      const waitingFor = placeholdersInSnapshot(snapshot, flags)
      if (waitingFor.length) return err({ code: 'placeholders', waitingFor })
      return ok(plainPdf(linesOf(snapshot, flags)))
    },
  }
}
