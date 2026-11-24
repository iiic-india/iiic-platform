import type { ArrayField, Field, TextFieldSingleValidation } from 'payload'
import { text } from 'payload/shared'

import { CLOCK_TIME, minutesOf } from '@/lib/settings/quietHours'

/** The days of the week, Monday first, as working hours are set (docs/04 `availability_rules`). */
export const WEEKDAYS = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
] as const

export type Weekday = (typeof WEEKDAYS)[number]['value']

const clock: TextFieldSingleValidation = async (value, options) => {
  const base = await text(value, options)
  if (base !== true) return base
  return (
    (typeof value === 'string' && CLOCK_TIME.test(value)) ||
    'Enter a time of day as HH:MM, India time, such as 10:00.'
  )
}

const afterStart: TextFieldSingleValidation = async (value, options) => {
  const base = await clock(value, options)
  if (base !== true) return base
  const start = minutesOf((options.siblingData as { start?: unknown } | undefined)?.start)
  const end = minutesOf(value)
  return start === null || end === null || end > start || 'The end comes after the start.'
}

const timeOfDay = (
  name: 'start' | 'end',
  label: string,
  validate: TextFieldSingleValidation,
): Field => ({
  name,
  type: 'text',
  label,
  required: true,
  maxLength: 5,
  validate,
  admin: { width: '50%', placeholder: name === 'start' ? '10:00' : '13:00' },
})

/**
 * Spans of working time in one day, India time, as HH:MM to HH:MM; more than one a day is allowed
 * (docs/04). No defaults: each practitioner's hours are set in the admin (D-02, I-24).
 */
export function workingSpans(description: string, required = true): ArrayField {
  return {
    name: 'spans',
    type: 'array',
    label: 'Working time',
    labels: { singular: 'Span', plural: 'Spans' },
    minRows: required ? 1 : 0,
    maxRows: 6,
    admin: { description },
    fields: [
      {
        type: 'row',
        fields: [timeOfDay('start', 'From', clock), timeOfDay('end', 'Until', afterStart)],
      },
    ],
  }
}
