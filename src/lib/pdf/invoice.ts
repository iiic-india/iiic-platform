import type { BasisPoints, Paise } from '@/lib/payments/money'
import type { InvoiceKind } from '@/lib/payments/states'
import { err, ok, type Result } from '@/lib/result'

import { formatDay, formatHalfRate, formatRate, formatRupees, rupeesInWords } from './format'
import { placeOfSupply } from './gstStates'
import {
  escapeHtml,
  escapeLines,
  fillTemplate,
  markup,
  replaceOnce,
  todo,
  type MergeError,
} from './merge'

/**
 * The client's copy of a document Zoho Books issued (D-13), printed through the kit's
 * `invoice.html` (docs/16 §10: "rendered from src/brand/templates/print/invoice.html with Zoho's
 * number and the mirrored totals; Zoho Books stays the record"). Pure: the typed merge fields in,
 * the filled page out. Every amount is the platform's own, in paise; every fact IIIC has not
 * supplied prints as its placeholder, and a document that still holds one is not issued to a
 * client (`placeholdersIn`).
 */

export type InvoiceLine = {
  description: string
  /** A second, smaller line under the description, such as the booking's date. */
  detail: string | null
  sacCode: string | null
  quantity: number
  /** The taxable value of the line. */
  taxablePaise: Paise
}

export type InvoiceDocument = {
  kind: InvoiceKind
  /** Zoho's number. */
  number: string
  /** Days as YYYY-MM-DD, as Zoho gives them. */
  issuedOn: string
  dueOn: string | null
  paymentTerms: string | null
  /** The booking's reference, which the client knows the booking by. */
  reference: string
  reverseCharge: boolean
  /** The GST rate of the lines, for the CGST and SGST (or IGST) rows. */
  rateBasisPoints: BasisPoints
  supplier: {
    gstin: string | null
    udyam: string | null
    /** As it should print, over several lines (Settings, I-33). */
    address: string | null
    email: string
    stateCode: string | null
    signatory: string | null
    signatureNote: string | null
  }
  bank: {
    bankName: string | null
    accountName: string | null
    accountNumber: string | null
    ifsc: string | null
    upiId: string | null
  }
  buyer: {
    name: string
    address: string | null
    gstin: string | null
    stateCode: string | null
  }
  lines: InvoiceLine[]
  totals: {
    taxablePaise: Paise
    cgstPaise: Paise
    sgstPaise: Paise
    igstPaise: Paise
    totalPaise: Paise
  }
}

/** The document's name as it prints (src/brand/templates/print/README.md). */
export const DOCUMENT_TYPES: Readonly<Record<InvoiceKind, string>> = {
  taxInvoice: 'Tax invoice',
  receiptVoucher: 'Receipt voucher',
  refundVoucher: 'Refund voucher',
  creditNote: 'Credit note',
}

/**
 * The facts a document waits for, with the inputs in docs/09 that supply them. The signatory and
 * the signature note have no input yet (proposed as I-50).
 */
export const INVOICE_PLACEHOLDERS = {
  gstin: { id: 'I-05', what: 'the GSTIN' },
  udyam: { id: 'I-05', what: 'the Udyam registration number' },
  address: { id: 'I-33', what: 'the address as it should print, with its PIN' },
  bankName: { id: 'I-06', what: 'the bank' },
  accountName: { id: 'I-06', what: 'the account name' },
  accountNumber: { id: 'I-06', what: 'the account number' },
  ifsc: { id: 'I-06', what: 'the IFSC' },
  upiId: { id: 'I-06', what: 'the UPI id' },
  signatory: { id: 'I-50', what: 'the authorised signatory’s name' },
  signatureNote: { id: 'I-50', what: 'the note under the signature' },
  placeOfSupply: { id: 'I-05', what: 'the place of supply' },
} as const

const or = (value: string | null, key: keyof typeof INVOICE_PLACEHOLDERS) =>
  value ?? todo(INVOICE_PLACEHOLDERS[key].what, INVOICE_PLACEHOLDERS[key].id)

/** Exact pieces of the kit's invoice.html that change with the data. */
export const INVOICE_PIECES = {
  supplierAddress: '408, The Claywalls, Hebatpur Road<br>Thaltej, Ahmedabad, Gujarat 382455<br>',
  buyerAddress: '<br>{{client_address}}',
  buyerGstin: '<br>GSTIN {{client_gstin}}',
  cgstRow:
    '<tr><td colspan="4" class="num">CGST {{cgst_rate}}%</td><td class="num">{{cgst}}</td></tr>',
  sgstRow:
    '<tr><td colspan="4" class="num">SGST {{sgst_rate}}%</td><td class="num">{{sgst}}</td></tr>',
} as const

export type InvoiceError =
  MergeError | { code: 'template-changed'; piece: string } | { code: 'totals-mismatch' }

function lineRow(line: InvoiceLine): string {
  const rate = Math.round(line.taxablePaise / line.quantity)
  const detail = line.detail ? `<small>${escapeHtml(line.detail)}</small>` : ''
  return (
    `<tr><td>${escapeHtml(line.description)}${detail}</td>` +
    `<td>${escapeHtml(line.sacCode ?? '')}</td>` +
    `<td class="num">${line.quantity}</td>` +
    `<td class="num">${formatRupees(rate)}</td>` +
    `<td class="num">${formatRupees(line.taxablePaise)}</td></tr>`
  )
}

/** The totals must be the lines' and the heads' sum, or nothing is printed. */
function totalsAddUp({ lines, totals }: InvoiceDocument): boolean {
  const taxable = lines.reduce((sum, line) => sum + line.taxablePaise, 0)
  return (
    taxable === totals.taxablePaise &&
    totals.taxablePaise + totals.cgstPaise + totals.sgstPaise + totals.igstPaise ===
      totals.totalPaise
  )
}

/** The kit's invoice page filled with one document; the template comes in as text. */
export function invoiceHtml(template: string, doc: InvoiceDocument): Result<string, InvoiceError> {
  if (!totalsAddUp(doc)) return err({ code: 'totals-mismatch' })
  let page = template
  const swap = (piece: string, replacement: string) => {
    const next = replaceOnce(page, piece, replacement)
    if (!next.ok) return next
    page = next.value
    return ok(page)
  }

  const address = doc.supplier.address
    ? `${escapeLines(doc.supplier.address)}<br>`
    : `${escapeHtml(or(null, 'address'))}<br>`
  const steps = [
    swap(INVOICE_PIECES.supplierAddress, address),
    doc.buyer.address ? ok(page) : swap(INVOICE_PIECES.buyerAddress, ''),
    doc.buyer.gstin ? ok(page) : swap(INVOICE_PIECES.buyerGstin, ''),
  ]
  const interState = doc.totals.igstPaise > 0
  if (interState) {
    steps.push(
      swap(
        INVOICE_PIECES.cgstRow,
        '<tr><td colspan="4" class="num">IGST {{igst_rate}}%</td><td class="num">{{igst}}</td></tr>',
      ),
      swap(INVOICE_PIECES.sgstRow, ''),
    )
  }
  const failed = steps.find((step) => !step.ok)
  if (failed && !failed.ok) return failed

  const half = formatHalfRate(doc.rateBasisPoints)
  const heads: Record<string, string> = interState
    ? {
        igst_rate: formatRate(doc.rateBasisPoints),
        igst: formatRupees(doc.totals.igstPaise),
      }
    : {
        cgst_rate: half,
        cgst: formatRupees(doc.totals.cgstPaise),
        sgst_rate: half,
        sgst: formatRupees(doc.totals.sgstPaise),
      }

  const { supplier, bank, buyer } = doc
  const place = placeOfSupply(buyer.stateCode ?? supplier.stateCode)
  return fillTemplate(page, {
    document_type: DOCUMENT_TYPES[doc.kind],
    EMAIL: supplier.email,
    gstin: or(supplier.gstin, 'gstin'),
    udyam: or(supplier.udyam, 'udyam'),
    invoice_number: doc.number,
    client_name: buyer.name,
    ...(buyer.address ? { client_address: markup(escapeLines(buyer.address)) } : {}),
    ...(buyer.gstin ? { client_gstin: buyer.gstin } : {}),
    invoice_date: formatDay(doc.issuedOn),
    // A credit note has no due date and no terms; the row prints a dash, not a guess.
    due_date: doc.dueOn ? formatDay(doc.dueOn) : '—',
    place_of_supply: or(place, 'placeOfSupply'),
    reverse_charge: doc.reverseCharge ? 'Yes' : 'No',
    reference: doc.reference,
    line_items: markup(doc.lines.map(lineRow).join('')),
    subtotal: formatRupees(doc.totals.taxablePaise),
    ...heads,
    total: formatRupees(doc.totals.totalPaise),
    total_in_words: rupeesInWords(doc.totals.totalPaise),
    bank_name: or(bank.bankName, 'bankName'),
    account_name: or(bank.accountName, 'accountName'),
    account_number: or(bank.accountNumber, 'accountNumber'),
    ifsc: or(bank.ifsc, 'ifsc'),
    upi_id: or(bank.upiId, 'upiId'),
    payment_terms: doc.paymentTerms ?? '—',
    signatory_name: or(supplier.signatory, 'signatory'),
    signature_note: or(supplier.signatureNote, 'signatureNote'),
  })
}
