import type { NumberField, NumberFieldSingleValidation } from 'payload'
import { number } from 'payload/shared'

/**
 * A whole number, checked after Payload's own number check, so that `min`, `max` and `required`
 * still hold; an empty value is left to them. Money is integer paise (CLAUDE.md #5), and minutes,
 * hours and basis points are whole too.
 */
export function wholeNumber(what: string): NumberFieldSingleValidation {
  return async (value, options) => {
    const base = await number(value, options)
    if (base !== true) return base
    return (
      value === null ||
      value === undefined ||
      Number.isInteger(value) ||
      `Enter ${what} as a whole number.`
    )
  }
}

/**
 * An amount in integer paise (CLAUDE.md #5): ₹1,500 is 150000. Never below nothing. The caller
 * adds the field's access: every amount on a booking, a payment, a refund or an invoice is written
 * by the server, which computes totals and tax itself.
 */
export function paiseField(
  name: string,
  label: string,
  options: Partial<Pick<NumberField, 'access' | 'required' | 'index' | 'defaultValue'>> & {
    description?: string
    min?: number
  } = {},
): NumberField {
  const { description, min = 0, ...rest } = options
  return {
    name,
    type: 'number',
    label,
    min,
    validate: wholeNumber('the amount in paise'),
    ...rest,
    admin: { step: 1, ...(description ? { description } : {}) },
  } as NumberField
}

/** A GST rate in basis points: 18% is 1800. Whole, from 0 (exempt or nil-rated) to 100%. */
export function basisPointsField(name: string, label: string, description: string): NumberField {
  return {
    name,
    type: 'number',
    label,
    min: 0,
    max: 10_000,
    validate: wholeNumber('the rate in basis points'),
    admin: { step: 1, description },
  }
}
