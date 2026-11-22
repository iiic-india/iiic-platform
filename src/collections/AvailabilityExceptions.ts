import type { CollectionConfig } from 'payload'

import { allow, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { istDayField } from '@/fields/istDay'
import { workingSpans } from '@/fields/workingSpans'

/**
 * A day that differs from a practitioner's working hours (docs/04 `availability_exceptions`;
 * docs/05, Calendar): closed (a holiday, leave) or open at other hours. The reason is for the
 * office and never reaches a client.
 */
export const AvailabilityExceptions: CollectionConfig = {
  slug: 'availability-exceptions',
  labels: { singular: 'Exception', plural: 'Exceptions to working hours' },
  admin: {
    group: 'Calendar',
    defaultColumns: ['practitioner', 'day', 'kind', 'reason'],
    hidden: ({ user }) => !hasRole(user, 'owner', 'operator', 'practitioner'),
  },
  access: {
    read: allow(POLICY.availabilityExceptions.read),
    create: allow(POLICY.availabilityExceptions.create),
    update: allow(POLICY.availabilityExceptions.update),
    delete: allow(POLICY.availabilityExceptions.delete),
  },
  defaultSort: '-day',
  indexes: [{ fields: ['practitioner', 'day'], unique: true }],
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
        istDayField('day', 'Day', { required: true }),
        {
          name: 'kind',
          type: 'select',
          required: true,
          defaultValue: 'closed',
          options: [
            { label: 'Closed all day', value: 'closed' },
            { label: 'Other hours', value: 'customHours' },
          ],
        },
      ],
    },
    {
      ...workingSpans('India time. These replace the usual hours on this day.', false),
      admin: {
        description: 'India time. These replace the usual hours on this day.',
        condition: (_, siblingData) => siblingData?.kind === 'customHours',
      },
    },
    { name: 'reason', type: 'text', maxLength: 200, admin: { description: 'For the office.' } },
  ],
}
