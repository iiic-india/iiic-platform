// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { feeTotalPaise, mayPrintFees } from '@/lib/pipeline/proposal/fees'
import { fakeProposalPrinter, rupees } from '@/lib/pipeline/proposal/print'
import {
  newReference,
  REFERENCE,
  referenceFor,
  versionReference,
} from '@/lib/pipeline/proposal/reference'
import {
  draftSnapshotOf,
  missingParts,
  readSnapshot,
  snapshotOf,
  type WorkingCopy,
} from '@/lib/pipeline/proposal/snapshot'
import {
  hashLinkToken,
  isLinkToken,
  linkPath,
  linkPdfPath,
  newLinkToken,
} from '@/lib/pipeline/proposal/tokens'

// A proposal's pure parts (docs/17 §5). Every value is obviously fake.
const COPY: WorkingCopy = {
  title: ' Fake proposal title ',
  subtitle: 'Fake subtitle',
  preparedByName: 'Fake Author',
  preparedByTitle: 'Fake Title',
  situation: 'Fake situation.',
  approach: 'Fake approach.',
  phases: [
    { name: 'Fake phase', what: 'Fake work.', duration: 'Fake weeks', outcome: 'Fake end.' },
  ],
  measures: 'Fake measures.',
  fees: [
    { item: 'Fake fee one', amountPaise: 1_000_00 },
    { item: 'Fake fee two', amountPaise: 2_500_50 },
  ],
  nextStep: 'Fake next step.',
}

describe('the fees rule (D-21; docs/17 §5)', () => {
  it('prints the fees section only while prices are public', () => {
    expect(mayPrintFees({ pricesPublic: false })).toBe(false)
    expect(mayPrintFees({ pricesPublic: true })).toBe(true)
  })

  it('leaves the fees section out of the stand-in’s page and PDF while prices are hidden', async () => {
    const printer = fakeProposalPrinter()
    const snapshot = snapshotOf(COPY, {
      clientName: 'Fake Client',
      date: '2026-11-23',
      reference: 'IIIC-P-24117',
      number: 1,
    })
    const shown = await printer.page(snapshot, { feesMayPrint: true })
    if (!shown.ok) throw new Error(shown.error.code)
    expect(shown.value).toContain('Fake fee one')
    expect(shown.value).toContain(rupees(3_500_50))
    const hidden = { feesMayPrint: false }
    const page = await printer.page(snapshot, hidden)
    const pdf = await printer.pdf(snapshot, hidden)
    if (!page.ok || !pdf.ok) throw new Error('not printed')
    for (const words of [page.value, new TextDecoder('latin1').decode(pdf.value)]) {
      expect(words).toContain('Fake next step.')
      for (const absent of ['Fees (', 'Fake fee one', rupees(1_000_00), 'Total, excluding GST']) {
        expect(words).not.toContain(absent)
      }
    }
    // With fees to print and none typed, the stand-in refuses as the kit's renderer does.
    expect(await printer.pdf({ ...snapshot, fees: [] }, { feesMayPrint: true })).toEqual({
      ok: false,
      error: { code: 'incomplete', missing: ['fees'] },
    })
    expect((await printer.pdf({ ...snapshot, fees: [] }, { feesMayPrint: false })).ok).toBe(true)
  })

  it('adds whole paise and refuses anything else', () => {
    expect(feeTotalPaise(COPY.fees)).toBe(3_500_50)
    expect(feeTotalPaise([])).toBe(0)
    expect(feeTotalPaise(null)).toBe(0)
    expect(() => feeTotalPaise([{ amountPaise: 10.5 }])).toThrow(RangeError)
    expect(() => feeTotalPaise([{ amountPaise: -1 }])).toThrow(RangeError)
  })
})

describe('the reference', () => {
  it('is IIIC-P- and five digits, drawn at random', () => {
    expect(referenceFor(24117)).toBe('IIIC-P-24117')
    expect(() => referenceFor(9999)).toThrow(RangeError)
    expect(() => referenceFor(100_000)).toThrow(RangeError)
    expect(newReference(() => 54321)).toBe('IIIC-P-54321')
    expect(newReference()).toMatch(REFERENCE)
    expect(versionReference('IIIC-P-24117', 2)).toBe('IIIC-P-24117 v2')
  })
})

describe('the tracked link token', () => {
  it('is 32 random bytes, kept only as its hash', () => {
    const { token, hash } = newLinkToken()
    expect(isLinkToken(token)).toBe(true)
    expect(hash).toBe(hashLinkToken(token))
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(token)
    expect(newLinkToken().token).not.toBe(token)
    expect(isLinkToken('short')).toBe(false)
    expect(isLinkToken(`${token}/`)).toBe(false)
    expect(linkPath(token)).toBe(`/p/${token}`)
    expect(linkPdfPath(token)).toBe(`/p/${token}/pdf`)
  })
})

describe('the snapshot', () => {
  const WITH_FEES = { feesMayPrint: true }
  const WITHOUT_FEES = { feesMayPrint: false }

  it('names every empty printed part', () => {
    expect(missingParts(COPY, 'Fake Client Pvt Ltd', WITH_FEES)).toEqual([])
    expect(missingParts({ ...COPY, subtitle: ' ', fees: [] }, null, WITH_FEES)).toEqual([
      'clientName',
      'subtitle',
      'fees',
    ])
    expect(
      missingParts(
        { ...COPY, phases: [{ name: 'x', what: '', duration: 'y', outcome: 'z' }] },
        'Fake',
        WITH_FEES,
      ),
    ).toEqual(['phases'])
    expect(
      missingParts({ ...COPY, fees: [{ item: 'Fake', amountPaise: 0 }] }, 'Fake', WITH_FEES),
    ).toEqual(['fees'])
  })

  it('needs no fees while they do not print, and every other part all the same', () => {
    expect(missingParts({ ...COPY, fees: [] }, 'Fake', WITHOUT_FEES)).toEqual([])
    expect(missingParts({ ...COPY, fees: null }, 'Fake', WITHOUT_FEES)).toEqual([])
    expect(missingParts({ ...COPY, nextStep: '', fees: [] }, 'Fake', WITHOUT_FEES)).toEqual([
      'nextStep',
    ])
  })

  it('freezes the words as typed, with the reference and the version number', () => {
    const snapshot = snapshotOf(COPY, {
      clientName: ' Fake Client Pvt Ltd ',
      date: '2026-11-23',
      reference: 'IIIC-P-24117',
      number: 2,
    })
    expect(snapshot).toMatchObject({
      clientName: 'Fake Client Pvt Ltd',
      title: 'Fake proposal title',
      reference: 'IIIC-P-24117 v2',
      authorName: 'Fake Author',
      date: '2026-11-23',
    })
    expect(snapshot.fees).toEqual([
      { item: 'Fake fee one', amountPaise: 1_000_00 },
      { item: 'Fake fee two', amountPaise: 2_500_50 },
    ])
    expect(readSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot)
    expect(readSnapshot({ ...snapshot, date: 'yesterday' })).toBeNull()
  })

  it('keeps empty parts empty in the draft preview, without a version number', () => {
    const draft = draftSnapshotOf(
      { ...COPY, subtitle: null },
      { clientName: null, date: '2026-11-23', reference: 'IIIC-P-24117' },
    )
    expect(draft.subtitle).toBe('')
    expect(draft.clientName).toBe('')
    expect(draft.reference).toBe('IIIC-P-24117')
  })
})
