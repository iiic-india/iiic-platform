import { err, ok, type Result } from '@/lib/result'

import type {
  BasisPoints,
  GstHeads,
  InclusiveSplit,
  Paise,
  PriceQuote,
  SplitGstHeads,
  SplitInclusive,
} from './money'

/**
 * The money contracts of src/lib/payments/money.ts, pure (docs/16 §5). Every amount is a whole
 * number of paise and every rate a whole number of basis points; the arithmetic runs in BigInt,
 * so no float ever touches money. No rate, price or SAC code is written here: they come from the
 * service and its price history (I-28, I-29). The rounding rules are the CA's to confirm (docs/16
 * §10): the taxable value rounds half up to the paise and the tax is the remainder, so the parts
 * always add up to the total; CGST takes the odd paise.
 */

const BASIS = 10_000n

function checkPaise(value: Paise, what: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${what} must be a whole, non-negative number of paise`)
  }
  return BigInt(value)
}

function checkRate(rate: BasisPoints): bigint {
  if (!Number.isInteger(rate) || rate < 0 || rate > 10_000) {
    throw new RangeError('A GST rate must be whole basis points from 0 to 10000')
  }
  return BigInt(rate)
}

/** n ÷ d rounded half up, for n ≥ 0 and d > 0. */
function divideHalfUp(n: bigint, d: bigint): bigint {
  return (2n * n + d) / (2n * d)
}

/** An all-in price: taxable = total × 10000 / (10000 + rate), half up; tax = total − taxable. */
export const splitInclusive: SplitInclusive = (totalPaise, rate) => {
  const total = checkPaise(totalPaise, 'A total')
  const taxable = divideHalfUp(total * BASIS, BASIS + checkRate(rate))
  return {
    taxablePaise: Number(taxable),
    taxPaise: Number(total - taxable),
    totalPaise: totalPaise,
  }
}

/**
 * A price set before tax (a service whose "includes GST" box the CA has had unticked): the tax
 * is price × rate / 10000, half up, added on top. Shown to the client as the total before they
 * pay (CLAUDE.md #9).
 */
export function splitExclusive(pricePaise: Paise, rate: BasisPoints): InclusiveSplit {
  const price = checkPaise(pricePaise, 'A price')
  const tax = divideHalfUp(price * checkRate(rate), BASIS)
  const total = price + tax
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('The total is too large')
  return { taxablePaise: pricePaise, taxPaise: Number(tax), totalPaise: Number(total) }
}

const STATE_CODE = /^\d{2}$/

function checkState(code: string): string {
  if (!STATE_CODE.test(code)) throw new RangeError('A GST state code is two digits')
  return code
}

/** CGST and SGST within the supplier's state (the odd paise to CGST), IGST between states. */
export const splitGstHeads: SplitGstHeads = (taxPaise, supplierStateCode, buyerStateCode) => {
  const tax = checkPaise(taxPaise, 'A tax')
  const supplier = checkState(supplierStateCode)
  const buyer = buyerStateCode === null ? supplier : checkState(buyerStateCode)
  if (supplier !== buyer) return { cgstPaise: 0, sgstPaise: 0, igstPaise: taxPaise }
  const sgst = tax / 2n
  const heads: GstHeads = { cgstPaise: Number(tax - sgst), sgstPaise: Number(sgst), igstPaise: 0 }
  return heads
}

const GSTIN_STATE = /^(\d{2})[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

/** The state a GSTIN was issued in: its first two digits. Null for anything that is not one. */
export function stateCodeOfGstin(gstin: string | null | undefined): string | null {
  return (gstin && GSTIN_STATE.exec(gstin)?.[1]) || null
}

/** A price row as the quote reads it: the price in force for one option of one service. */
export type PriceInForce = {
  priceHistoryId: number
  pricePaise: Paise
  gstInclusive: boolean
  /** The rate on the price row, else the service's; null while the CA has not set it (I-29). */
  rate: BasisPoints | null
  sacCode: string | null
}

export type QuoteError = { code: 'rate-missing' }

/**
 * What a booking of this option costs, from the price in force (docs/16 §5). A free option costs
 * nothing whatever its rate. A priced option with no GST rate set is not quoted: the tax and the
 * invoice cannot be worked out, so the flow takes no payment for it (docs/16 §10).
 */
export function quoteFromPrice(price: PriceInForce): Result<PriceQuote, QuoteError> {
  const base = { sacCode: price.sacCode, priceHistoryId: price.priceHistoryId }
  if (price.pricePaise === 0) {
    return ok({ taxablePaise: 0, taxPaise: 0, totalPaise: 0, rate: price.rate ?? 0, ...base })
  }
  if (price.rate === null) return err({ code: 'rate-missing' })
  const split = price.gstInclusive
    ? splitInclusive(price.pricePaise, price.rate)
    : splitExclusive(price.pricePaise, price.rate)
  return ok({ ...split, rate: price.rate, ...base })
}
