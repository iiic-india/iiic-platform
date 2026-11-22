import { parsePhoneNumberFromString } from 'libphonenumber-js/max'
import type { TextField, TextFieldSingleValidation } from 'payload'
import { text } from 'payload/shared'

/**
 * Phone numbers are stored in E.164, +91 and the number with no spaces (CLAUDE.md #8), and read
 * by libphonenumber-js with its full metadata, so a number is checked against its country's own
 * numbering plan. A number typed without a country code is read as an Indian one.
 */

/** The number in E.164, or null when it is not a valid phone number. */
export function toE164(input: string): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), 'IN')
  return parsed?.isValid() ? parsed.number : null
}

/** A stored number as a person reads it, such as +91 96240 46464. */
export function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164
}

export const PHONE_MESSAGE =
  'Enter a valid phone number. A number outside India needs its country code.'

/**
 * Payload's own text check, then the number: anything that reads as a valid number passes, so
 * the admin does not flag a number typed with spaces, which is stored in E.164 when it is saved.
 */
export const validatePhone: TextFieldSingleValidation = async (value, options) => {
  const base = await text(value, options)
  if (base !== true) return base
  if (typeof value !== 'string' || value.trim() === '') return true
  return toE164(value) !== null || PHONE_MESSAGE
}

/** A phone field: checked as typed, stored in E.164. */
export function phoneField(
  name: string,
  options: { label?: string; description?: string; index?: boolean } = {},
): TextField {
  return {
    name,
    type: 'text',
    label: options.label,
    index: options.index,
    validate: validatePhone,
    hooks: {
      beforeValidate: [
        ({ value }) => {
          if (typeof value !== 'string') return value
          if (value.trim() === '') return null
          return toE164(value) ?? value
        },
      ],
    },
    admin: { description: options.description },
  }
}
