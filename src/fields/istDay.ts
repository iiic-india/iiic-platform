import { isMatch } from 'date-fns'
import type { TextField, TextFieldSingleValidation } from 'payload'
import { text } from 'payload/shared'

/** A calendar day in India, as YYYY-MM-DD: the form src/lib/time/ist.ts `istDay` writes. */
export const IST_DAY = /^\d{4}-\d{2}-\d{2}$/

/** Whether a value is a real calendar day written as YYYY-MM-DD (no 31 February). */
export function isIstDay(value: unknown): value is string {
  return typeof value === 'string' && IST_DAY.test(value) && isMatch(value, 'yyyy-MM-dd')
}

export const validateIstDay: TextFieldSingleValidation = async (value, options) => {
  const base = await text(value, options)
  if (base !== true) return base
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    isIstDay(value) ||
    'Enter the day as YYYY-MM-DD, such as 2026-12-01.'
  )
}

/**
 * A calendar day, India time, stored as the text YYYY-MM-DD rather than as an instant: a day off
 * or the first day of new hours is a day in India wherever the admin is opened, and two entries
 * for one day compare equal in the database (a unique index can hold them apart).
 */
export function istDayField(
  name: string,
  label: string,
  options: {
    required?: boolean
    index?: boolean
    description?: string
    /** A further check, run after the day's own (validateIstDay). */
    validate?: TextFieldSingleValidation
  } = {},
): TextField {
  const further = options.validate
  return {
    name,
    type: 'text',
    label,
    required: options.required,
    index: options.index,
    maxLength: 10,
    validate: further
      ? async (value, args) => {
          const base = await validateIstDay(value, args)
          return base === true ? further(value, args) : base
        }
      : validateIstDay,
    admin: {
      placeholder: 'YYYY-MM-DD',
      description: options.description ?? 'The day in India, as YYYY-MM-DD.',
    },
  }
}
