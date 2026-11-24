import type { InvoiceDocument } from '@/lib/pdf/invoice'
import type { ProposalDocument } from '@/lib/pdf/proposal'

/**
 * Obviously fake documents for the PDF tests: no value here is IIIC's, a client's, a rate the CA
 * has set or a price (CLAUDE.md #1). The GSTIN is the format's own textbook example, the bank is
 * named "Fake", the amounts are round test values. Plain data, so the end-to-end specs can import
 * it (it reaches no stylesheet).
 */

export const FAKE_INVOICE: InvoiceDocument = {
  kind: 'taxInvoice',
  number: 'FAKE-INV-0001',
  issuedOn: '2026-11-20',
  dueOn: '2026-11-20',
  paymentTerms: 'Fake terms: due on receipt',
  reference: 'IIIC-S-00000',
  reverseCharge: false,
  rateBasisPoints: 1800,
  supplier: {
    gstin: '24AAAAA0000A1Z5',
    udyam: 'UDYAM-GJ-00-0000000',
    address: 'Fake supplier line one\nFake town 000000',
    email: 'fake-invoices@example.com',
    stateCode: '24',
    signatory: 'Fake Signatory',
    signatureNote: 'Fake signature note',
  },
  bank: {
    bankName: 'Fake Bank',
    accountName: 'Fake Account Name',
    accountNumber: '000000000000',
    ifsc: 'FAKE0000000',
    upiId: 'fake@upi',
  },
  buyer: { name: 'Fake Buyer <One>', address: null, gstin: null, stateCode: null },
  lines: [
    {
      description: 'Fake session · Fake option',
      detail: 'Booking IIIC-S-00000',
      sacCode: '999999',
      quantity: 1,
      taxablePaise: 100_000,
    },
  ],
  totals: {
    taxablePaise: 100_000,
    cgstPaise: 9_000,
    sgstPaise: 9_000,
    igstPaise: 0,
    totalPaise: 118_000,
  },
}

/** Every value the fake invoice must print, as it prints. */
export const FAKE_INVOICE_PRINTS = [
  'Tax invoice',
  'FAKE-INV-0001',
  '24AAAAA0000A1Z5',
  'UDYAM-GJ-00-0000000',
  'Fake supplier line one',
  'fake-invoices@example.com',
  'Fake Buyer <One>',
  '20 November 2026',
  'Gujarat (24)',
  'IIIC-S-00000',
  'Fake session · Fake option',
  '999999',
  '1,000.00',
  '90.00',
  '1,180.00',
  'One Thousand One Hundred Eighty Rupees Only',
  'Fake Bank',
  'FAKE0000000',
  'fake@upi',
  'Fake terms: due on receipt',
  'Fake Signatory',
] as const

export const FAKE_PROPOSAL: ProposalDocument = {
  clientName: 'Fake Organisation',
  title: 'Fake proposal title',
  subtitle: 'Fake subtitle',
  date: '2026-11-20',
  authorName: 'Fake Author',
  authorTitle: 'Fake title',
  reference: 'FAKE-PRO-0001',
  situation: 'Fake situation paragraph.',
  approach: 'Fake approach paragraph.',
  phases: [
    { name: 'Fake phase one', what: 'Fake work', duration: 'Fake weeks', outcome: 'Fake outcome' },
  ],
  measures: 'Fake measures paragraph.',
  fees: [
    { item: 'Fake fee one', amountPaise: 100_000 },
    { item: 'Fake fee two', amountPaise: 50_050 },
  ],
  nextStep: 'Fake next step.',
}

export const FAKE_PROPOSAL_PRINTS = [
  'Fake Organisation',
  'Fake proposal title',
  'Fake subtitle',
  '20 November 2026',
  'Fake Author',
  'FAKE-PRO-0001',
  'Fake situation paragraph.',
  'Fake phase one',
  'Fake measures paragraph.',
  'Fake fee one',
  '1,000.00',
  '500.50',
  '1,500.50',
  'Fake next step.',
] as const

/** What FAKE_PROPOSAL prints only in its fees section: the items, the amounts and the total. */
export const FAKE_PROPOSAL_FEE_PRINTS: readonly string[] = [
  'Fake fee one',
  'Fake fee two',
  '1,000.00',
  '500.50',
  '1,500.50',
]
