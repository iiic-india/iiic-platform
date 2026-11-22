import type { CollectionConfig, TextFieldSingleValidation } from 'payload'

import { allow, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { istDayField } from '@/fields/istDay'
import { WEEKDAYS, workingSpans } from '@/fields/workingSpans'
import { ownProfileOnly } from '@/lib/booking/availabilityHooks'
import { bookableTimesHandler } from '@/lib/office/handlers'

/** The last day comes on or after the first (days as YYYY-MM-DD compare as text). */
const notBeforeFrom: TextFieldSingleValidation = (value, { siblingData }) => {
  const from = (siblingData as { validFrom?: unknown } | undefined)?.validFrom
  if (!value || typeof from !== 'string' || !from) return true
  return value >= from || 'The last day comes on or after the first.'
}

/**
 * A practitioner's working hours on one day of the week (docs/04 `availability_rules`; docs/05,
 * Calendar; D-02): one or more spans of time, India time, from a first day and until a last one
 * if it ends. Free times are generated from these, minus exceptions, busy times and bookings
 * (src/lib/booking/slots.ts). No defaults anywhere: until a practitioner's hours are set, no
 * free time is offered for them (I-24).
 */
export const AvailabilityRules: CollectionConfig = {
  slug: 'availability-rules',
  labels: { singular: 'Working hours', plural: 'Working hours' },
  admin: {
    group: 'Calendar',
    defaultColumns: ['practitioner', 'weekday', 'validFrom', 'validTo'],
    hidden: ({ user }) => !hasRole(user, 'owner', 'operator', 'practitioner'),
  },
  access: {
    read: allow(POLICY.availabilityRules.read),
    create: allow(POLICY.availabilityRules.create),
    update: allow(POLICY.availabilityRules.update),
    delete: allow(POLICY.availabilityRules.delete),
  },
  // A practitioner keeps to their own profile (src/lib/booking/availabilityHooks.ts).
  hooks: { beforeChange: [ownProfileOnly] },
  // The preview of bookable times (docs/05, Calendar; src/lib/office/handlers.ts): the office
  // for anyone, a practitioner for their own profile, after the two-factor code.
  endpoints: [{ path: '/bookable-times', method: 'get', handler: bookableTimesHandler }],
  indexes: [{ fields: ['practitioner', 'weekday'] }],
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'practitioner',
          type: 'relationship',
          relationTo: 'practitioners',
          required: true,
          index: true,
        },
        { name: 'weekday', type: 'select', label: 'Day', required: true, options: [...WEEKDAYS] },
      ],
    },
    workingSpans('India time. Add a second span for a break, such as 10:00–13:00 and 14:00–18:00.'),
    {
      type: 'row',
      fields: [
        istDayField('validFrom', 'From', {
          required: true,
          description: 'The first day these hours hold, as YYYY-MM-DD.',
        }),
        istDayField('validTo', 'Until (optional)', {
          description: 'The last day these hours hold, as YYYY-MM-DD. Empty: until changed.',
          validate: notBeforeFrom,
        }),
      ],
    },
  ],
}
