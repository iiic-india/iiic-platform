// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { feeTotalPaise, mayPrintFees } from '@/lib/pipeline/proposal/fees'
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
  it('lets fees print only while prices are public', () => {
    expect(mayPrintFees({ pricesPublic: false })).toBe(false)
    expect(mayPrintFees({ pricesPublic: true })).toBe(true)
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
  it('names every empty printed part', () => {
    expect(missingParts(COPY, 'Fake Client Pvt Ltd')).toEqual([])
    expect(missingParts({ ...COPY, subtitle: ' ', fees: [] }, null)).toEqual([
      'clientName',
      'subtitle',
      'fees',
    ])
    expect(
      missingParts(
        { ...COPY, phases: [{ name: 'x', what: '', duration: 'y', outcome: 'z' }] },
        'Fake',
      ),
    ).toEqual(['phases'])
    expect(missingParts({ ...COPY, fees: [{ item: 'Fake', amountPaise: 0 }] }, 'Fake')).toEqual([
      'fees',
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
