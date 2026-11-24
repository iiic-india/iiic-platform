// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { invoicePage, proposalPage } from '@/lib/pdf/documents'
import {
  formatDay,
  formatHalfRate,
  formatRate,
  formatRupees,
  rupeesInWords,
} from '@/lib/pdf/format'
import { placeOfSupply } from '@/lib/pdf/gstStates'
import { INVOICE_PIECES, invoiceHtml, type InvoiceDocument } from '@/lib/pdf/invoice'
import {
  escapeHtml,
  fieldsOf,
  fillTemplate,
  markup,
  placeholdersIn,
  replaceOnce,
  todo,
} from '@/lib/pdf/merge'
import { proposalHtml, withoutFeesSection } from '@/lib/pdf/proposal'
import { readPrintTemplate, selfContained, printTemplateDir } from '@/lib/pdf/templates'

import {
  FAKE_INVOICE,
  FAKE_INVOICE_PRINTS,
  FAKE_PROPOSAL,
  FAKE_PROPOSAL_FEE_PRINTS as FEE_PRINTS,
  FAKE_PROPOSAL_PRINTS,
} from '../helpers/documents'

// The print templates as the platform fills them (D-09; docs/16 §11, "Invoice PDF matches the
// print template"): every merge value reaches the page, nothing is left as {{…}}, unknown facts
// print as placeholders, and the kit's own markup changes only where the data asks for it.

/** The page's visible text, roughly: tags out, entities back. */
function text(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

describe('fillTemplate', () => {
  it('fills every field and escapes text, but not markup built from escaped values', () => {
    const filled = fillTemplate('<p>{{a}}</p><table>{{rows}}</table>', {
      a: '<b>&"x"</b>',
      rows: markup('<tr><td>1</td></tr>'),
    })
    expect(filled).toEqual({
      ok: true,
      value: '<p>&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;</p><table><tr><td>1</td></tr></table>',
    })
  })

  it('prints a dollar sign as it is', () => {
    expect(fillTemplate('{{a}}', { a: 'US$ 5 $& $1' })).toEqual({
      ok: true,
      value: 'US$ 5 $&amp; $1',
    })
  })

  it('refuses a missing field and a field the template does not ask for', () => {
    expect(fillTemplate('{{a}} {{b}}', { a: 'x' })).toEqual({
      ok: false,
      error: { code: 'missing-field', fields: ['b'] },
    })
    expect(fillTemplate('{{a}}', { a: 'x', c: 'y' })).toEqual({
      ok: false,
      error: { code: 'unknown-field', fields: ['c'] },
    })
  })

  it('ignores fields named only in comments, and drops the comments', () => {
    const template = '<!-- {{hint}} --><p>{{a}}</p>'
    expect(fieldsOf(template)).toEqual(['a'])
    expect(fillTemplate(template, { a: 'x' })).toEqual({ ok: true, value: '<p>x</p>' })
  })

  it('finds placeholders, and replaces a piece only when it is there exactly once', () => {
    expect(placeholdersIn(`a ${todo('the GSTIN', 'I-05')} b`)).toEqual([
      '[[TODO: the GSTIN, I-05]]',
    ])
    expect(replaceOnce('a b a', 'a', 'c')).toEqual({
      ok: false,
      error: { code: 'template-changed', piece: 'a' },
    })
    expect(replaceOnce('a b', 'x', 'c').ok).toBe(false)
    expect(replaceOnce('a b', 'b', '$&')).toEqual({ ok: true, value: 'a $&' })
    expect(escapeHtml("'")).toBe('&#39;')
  })
})

describe('formats', () => {
  it('prints paise as Indian-grouped rupees from whole numbers', () => {
    expect(formatRupees(0)).toBe('0.00')
    expect(formatRupees(5)).toBe('0.05')
    expect(formatRupees(118_000)).toBe('1,180.00')
    expect(formatRupees(12_345_650)).toBe('1,23,456.50')
    expect(() => formatRupees(1.5)).toThrow(RangeError)
    expect(() => formatRupees(-1)).toThrow(RangeError)
  })

  it('prints rates and half rates', () => {
    expect(formatRate(1800)).toBe('18')
    expect(formatRate(250)).toBe('2.5')
    expect(formatHalfRate(1800)).toBe('9')
    expect(formatHalfRate(500)).toBe('2.5')
    expect(formatHalfRate(1801)).toBe('9.005')
  })

  it('writes amounts in words the Indian way', () => {
    expect(rupeesInWords(118_000)).toBe('One Thousand One Hundred Eighty Rupees Only')
    expect(rupeesInWords(12_345_650)).toBe(
      'One Lakh Twenty Three Thousand Four Hundred Fifty Six Rupees And Fifty Paise Only',
    )
    expect(rupeesInWords(5)).toBe('Zero Rupees And Five Paise Only')
  })

  it('prints days and places of supply', () => {
    expect(formatDay('2026-11-20')).toBe('20 November 2026')
    expect(placeOfSupply('24')).toBe('Gujarat (24)')
    expect(placeOfSupply('99')).toBeNull()
    expect(placeOfSupply(null)).toBeNull()
  })
})

describe('invoice.html', () => {
  it('still holds every piece the platform changes', async () => {
    const template = await readPrintTemplate('invoice')
    for (const piece of Object.values(INVOICE_PIECES)) {
      expect(template.split(piece).length, piece).toBe(2)
    }
  })

  it('prints every value of a document and leaves no merge field', async () => {
    const page = invoiceHtml(await readPrintTemplate('invoice'), FAKE_INVOICE)
    if (!page.ok) throw new Error(page.error.code)
    const printed = text(page.value)
    for (const value of FAKE_INVOICE_PRINTS) expect(printed).toContain(value)
    expect(page.value).not.toContain('{{')
    expect(placeholdersIn(page.value)).toEqual([])
    // The kit's own address and PIN wait on I-33: the settings' address prints instead.
    expect(printed).not.toContain('382455')
    // No buyer GSTIN or address: their lines are left out, not printed empty.
    expect(printed).not.toMatch(/GSTIN\s*Invoice date/)
    expect(printed).toContain('CGST 9%')
    expect(printed).toContain('SGST 9%')
    expect(printed).not.toContain('IGST')
  })

  it('prints one IGST row for a buyer in another state', async () => {
    const doc: InvoiceDocument = {
      ...FAKE_INVOICE,
      buyer: {
        name: 'Fake Buyer',
        address: 'Fake buyer street\nFake city',
        gstin: '27AAAAA0000A1Z5',
        stateCode: '27',
      },
      totals: { ...FAKE_INVOICE.totals, cgstPaise: 0, sgstPaise: 0, igstPaise: 18_000 },
    }
    const page = invoiceHtml(await readPrintTemplate('invoice'), doc)
    if (!page.ok) throw new Error(page.error.code)
    const printed = text(page.value)
    expect(printed).toContain('IGST 18% 180.00')
    expect(printed).not.toContain('CGST')
    expect(printed).not.toContain('SGST')
    expect(printed).toContain('Maharashtra (27)')
    expect(printed).toContain('GSTIN 27AAAAA0000A1Z5')
    expect(page.value).toContain('Fake buyer street<br>Fake city')
  })

  it('prints a placeholder for every fact IIIC has not supplied', async () => {
    const doc: InvoiceDocument = {
      ...FAKE_INVOICE,
      supplier: {
        ...FAKE_INVOICE.supplier,
        gstin: null,
        udyam: null,
        address: null,
        stateCode: null,
        signatory: null,
        signatureNote: null,
      },
      bank: { bankName: null, accountName: null, accountNumber: null, ifsc: null, upiId: null },
    }
    const page = invoiceHtml(await readPrintTemplate('invoice'), doc)
    if (!page.ok) throw new Error(page.error.code)
    const waiting = placeholdersIn(page.value).join(' ')
    for (const id of ['I-05', 'I-06', 'I-33', 'I-50']) expect(waiting).toContain(id)
  })

  it('refuses totals that do not add up', async () => {
    const doc = { ...FAKE_INVOICE, totals: { ...FAKE_INVOICE.totals, totalPaise: 118_001 } }
    expect(invoiceHtml(await readPrintTemplate('invoice'), doc)).toEqual({
      ok: false,
      error: { code: 'totals-mismatch' },
    })
  })

  it('names a credit note and prints a dash for its due date and terms', async () => {
    const doc = { ...FAKE_INVOICE, kind: 'creditNote' as const, dueOn: null, paymentTerms: null }
    const page = invoiceHtml(await readPrintTemplate('invoice'), doc)
    if (!page.ok) throw new Error(page.error.code)
    expect(text(page.value)).toContain('Credit note')
  })
})

describe('proposal.html', () => {
  it('prints every value of a proposal and leaves no merge field', async () => {
    const page = proposalHtml(await readPrintTemplate('proposal'), FAKE_PROPOSAL, {
      withFees: true,
    })
    if (!page.ok) throw new Error(page.error.code)
    const printed = text(page.value)
    for (const value of FAKE_PROPOSAL_PRINTS) expect(printed).toContain(value)
    expect(printed).toContain('4. Investment')
    expect(printed).toContain('5. Next step')
    expect(page.value).not.toContain('{{')
  })

  it('refuses a proposal with fees to print and none typed', async () => {
    const template = await readPrintTemplate('proposal')
    expect(proposalHtml(template, { ...FAKE_PROPOSAL, fees: [] }, { withFees: true })).toEqual({
      ok: false,
      error: { code: 'no-fees' },
    })
  })

  it('leaves the fees section out entirely while prices are hidden (D-21), and prints the rest', async () => {
    const template = await readPrintTemplate('proposal')
    for (const doc of [FAKE_PROPOSAL, { ...FAKE_PROPOSAL, fees: [] }]) {
      const page = proposalHtml(template, doc, { withFees: false })
      if (!page.ok) throw new Error(page.error.code)
      const printed = text(page.value)
      for (const value of FAKE_PROPOSAL_PRINTS.filter((value) => !FEE_PRINTS.includes(value))) {
        expect(printed).toContain(value)
      }
      // No heading, no table, no amount, no total, and nothing put in their place.
      for (const absent of [...FEE_PRINTS, 'Investment', 'Fee (₹)', '₹', 'Total, excluding GST']) {
        expect(printed).not.toContain(absent)
      }
      expect(page.value).not.toContain('iiic-doc-total')
      expect(printed).toContain('3. How we measure it')
      expect(printed).toContain('4. Next step')
      expect(printed).not.toContain('5. Next step')
      expect(page.value).not.toContain('{{')
    }
  })

  it('refuses to print without fees once the kit’s fees section is not where it was', () => {
    const moved =
      '<h2>4. Investment</h2><p>{{fee_rows}}</p><h2>5. Next step</h2><p>{{fee_total}}</p>'
    expect(withoutFeesSection(moved)).toMatchObject({
      ok: false,
      error: { code: 'template-changed' },
    })
    expect(withoutFeesSection('<h2>5. Next step</h2>')).toMatchObject({
      ok: false,
      error: { code: 'template-changed', piece: '<h2>4. Investment</h2>' },
    })
  })
})

describe('self-contained pages', () => {
  it('inlines the kit stylesheet, its fonts and the logos, and asks for nothing outside', async () => {
    const page = await invoicePage(FAKE_INVOICE)
    if (!page.ok) throw new Error(page.error.code)
    expect(page.value).toContain('<style>')
    expect(page.value).toContain('data:font/woff2;base64,')
    expect(page.value).toContain('src="data:image/svg+xml;base64,')
    expect(page.value).not.toMatch(/@import|<link\b|\.\.\/|https?:\/\/(?!www\.w3\.org)/)
    const proposal = await proposalPage(FAKE_PROPOSAL, { withFees: true })
    expect(proposal.ok && proposal.value.includes('iiic-cover')).toBe(true)
  })

  it('reads the templates from the kit', async () => {
    const html = await selfContained('<img src="../../logo/iiic-mark.svg">', printTemplateDir())
    expect(html).toMatch(/^<img src="data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+">$/)
  })
})
