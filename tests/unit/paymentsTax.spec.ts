// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  quoteFromPrice,
  splitExclusive,
  splitGstHeads,
  splitInclusive,
  stateCodeOfGstin,
} from '@/lib/payments/tax'

// The money contracts (docs/16 §5; src/lib/payments/money.ts): integer paise in, integer paise
// out, and the parts always add up to the whole. Rates and prices here are fake test values,
// never IIIC's (I-28, I-29).

const FAKE_RATE = 1800 // a test rate, not a rate IIIC has set

describe('splitInclusive', () => {
  it('splits an all-in price into taxable value and tax that add up to it', () => {
    expect(splitInclusive(118_000, FAKE_RATE)).toEqual({
      taxablePaise: 100_000,
      taxPaise: 18_000,
      totalPaise: 118_000,
    })
  })

  it('rounds the taxable value half up to the paise and leaves the tax as the remainder', () => {
    // 100 × 10000 / 11800 = 84.745… → 85; tax 15.
    expect(splitInclusive(100, FAKE_RATE)).toEqual({
      taxablePaise: 85,
      taxPaise: 15,
      totalPaise: 100,
    })
    // 59 × 10000 / 11800 = 50 exactly.
    expect(splitInclusive(59, FAKE_RATE).taxablePaise).toBe(50)
    // An exact half rounds up: 1 × 10000 / 20000 = 0.5 → 1.
    expect(splitInclusive(1, 10_000)).toEqual({ taxablePaise: 1, taxPaise: 0, totalPaise: 1 })
  })

  it('always adds up, over many amounts and rates', () => {
    for (const rate of [0, 500, 1200, FAKE_RATE, 2800, 10_000]) {
      for (let total = 0; total < 5000; total += 7) {
        const split = splitInclusive(total, rate)
        expect(split.taxablePaise + split.taxPaise).toBe(total)
        expect(Number.isInteger(split.taxablePaise)).toBe(true)
        expect(split.taxPaise).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('has no tax at a rate of nothing', () => {
    expect(splitInclusive(150_000, 0)).toEqual({
      taxablePaise: 150_000,
      taxPaise: 0,
      totalPaise: 150_000,
    })
  })

  it('refuses amounts and rates that are not whole, negative or past 100%', () => {
    expect(() => splitInclusive(10.5, FAKE_RATE)).toThrow(RangeError)
    expect(() => splitInclusive(-1, FAKE_RATE)).toThrow(RangeError)
    expect(() => splitInclusive(100, 12.5)).toThrow(RangeError)
    expect(() => splitInclusive(100, 10_001)).toThrow(RangeError)
    expect(() => splitInclusive(Number.MAX_SAFE_INTEGER + 2, FAKE_RATE)).toThrow(RangeError)
  })
})

describe('splitExclusive', () => {
  it('adds the tax on top, rounded half up, for a price the CA settles as before tax', () => {
    expect(splitExclusive(100_000, FAKE_RATE)).toEqual({
      taxablePaise: 100_000,
      taxPaise: 18_000,
      totalPaise: 118_000,
    })
    // 25 × 1800 / 10000 = 4.5 → 5.
    expect(splitExclusive(25, FAKE_RATE)).toEqual({ taxablePaise: 25, taxPaise: 5, totalPaise: 30 })
  })
})

describe('splitGstHeads', () => {
  it('halves the tax into CGST and SGST within one state, the odd paise to CGST', () => {
    expect(splitGstHeads(18_001, '24', '24')).toEqual({
      cgstPaise: 9001,
      sgstPaise: 9000,
      igstPaise: 0,
    })
  })

  it('treats a buyer with no state as within the supplier’s state', () => {
    expect(splitGstHeads(100, '24', null)).toEqual({ cgstPaise: 50, sgstPaise: 50, igstPaise: 0 })
  })

  it('puts the whole tax on IGST between states', () => {
    expect(splitGstHeads(18_000, '24', '27')).toEqual({
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 18_000,
    })
  })

  it('refuses a state code that is not two digits', () => {
    expect(() => splitGstHeads(100, 'GJ', '24')).toThrow(RangeError)
    expect(() => splitGstHeads(100, '24', '7')).toThrow(RangeError)
  })
})

describe('stateCodeOfGstin', () => {
  it('reads the state from the first two digits of a GSTIN, and nothing else', () => {
    // A made-up GSTIN in the right form, not IIIC's (I-05).
    expect(stateCodeOfGstin('24AAAAA0000A1Z5')).toBe('24')
    expect(stateCodeOfGstin('not a gstin')).toBeNull()
    expect(stateCodeOfGstin(null)).toBeNull()
  })
})

describe('quoteFromPrice', () => {
  const row = { priceHistoryId: 7, pricePaise: 118_000, gstInclusive: true, sacCode: '000000' }

  it('quotes an all-in price with its tax, rate, SAC code and the price row it came from', () => {
    const quote = quoteFromPrice({ ...row, rate: FAKE_RATE })
    expect(quote).toEqual({
      ok: true,
      value: {
        taxablePaise: 100_000,
        taxPaise: 18_000,
        totalPaise: 118_000,
        rate: FAKE_RATE,
        sacCode: '000000',
        priceHistoryId: 7,
      },
    })
  })

  it('adds the tax for a price set before tax', () => {
    const quote = quoteFromPrice({ ...row, pricePaise: 100_000, gstInclusive: false, rate: 1800 })
    expect(quote.ok && quote.value.totalPaise).toBe(118_000)
  })

  it('refuses to quote a price whose GST rate nobody has set', () => {
    expect(quoteFromPrice({ ...row, rate: null })).toEqual({
      ok: false,
      error: { code: 'rate-missing' },
    })
  })

  it('quotes a free option as nothing to pay', () => {
    const quote = quoteFromPrice({ ...row, pricePaise: 0, rate: null })
    expect(quote.ok && quote.value.totalPaise).toBe(0)
  })
})
