import { ToWords } from 'to-words'

import type { BasisPoints, Paise } from '@/lib/payments/money'
import { formatIstDate } from '@/lib/time/ist'

/**
 * How documents print amounts, rates and days. Amounts arrive as whole paise and are printed
 * from whole numbers (no float ever touches them): rupees grouped the Indian way, then the paise,
 * as the template's "(₹)" columns expect: 1,23,456.50.
 */

const GROUPING = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

function checkPaise(value: Paise): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('An amount must be a whole, non-negative number of paise')
  }
}

/** 12345650 paise → "1,23,456.50". */
export function formatRupees(paise: Paise): string {
  checkPaise(paise)
  const rupees = Math.floor(paise / 100)
  const rest = paise % 100
  return `${GROUPING.format(rupees)}.${String(rest).padStart(2, '0')}`
}

/** A rate in basis points as a percentage: 1800 → "18", 900 → "9", 250 → "2.5". */
export function formatRate(rate: BasisPoints): string {
  if (!Number.isInteger(rate) || rate < 0 || rate > 10_000) {
    throw new RangeError('A rate must be whole basis points from 0 to 10000')
  }
  const whole = Math.floor(rate / 100)
  const fraction = String(rate % 100)
    .padStart(2, '0')
    .replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : String(whole)
}

/** Half a rate, for CGST and SGST each: 1800 → "9", 500 → "2.5", 1801 → "9.005". */
export function formatHalfRate(rate: BasisPoints): string {
  formatRate(rate)
  // Thousandths of a percent, so an odd number of basis points halves exactly.
  const thousandths = rate * 5
  const whole = Math.floor(thousandths / 1000)
  const fraction = String(thousandths % 1000)
    .padStart(3, '0')
    .replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : String(whole)
}

const WORDS = new ToWords({
  localeCode: 'en-IN',
  converterOptions: { currency: true, ignoreDecimal: false, ignoreZeroCurrency: false },
})

/** The amount in words, the Indian way: "One Lakh Twenty Three Thousand Rupees Only". */
export function rupeesInWords(paise: Paise): string {
  checkPaise(paise)
  const rupees = Math.floor(paise / 100)
  const rest = paise % 100
  // Built from the two whole parts, so the converter never sees a float it might round.
  const rupeeWords = WORDS.convert(rupees).replace(/ Only$/, '')
  if (rest === 0) return `${rupeeWords} Only`
  const paiseWords = new ToWords({ localeCode: 'en-IN' }).convert(rest)
  return `${rupeeWords} And ${paiseWords} Paise Only`
}

/** A day given as YYYY-MM-DD, as src/brand/VOICE.md writes dates: 22 November 2026. */
export function formatDay(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new RangeError('A day is YYYY-MM-DD')
  // Noon in India, so the day is the same whatever the server's own zone.
  return formatIstDate(new Date(`${day}T12:00:00+05:30`))
}
