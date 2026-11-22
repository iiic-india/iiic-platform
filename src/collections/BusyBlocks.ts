import type { CollectionConfig } from 'payload'

import { allow, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { busyBlockInOrder } from '@/lib/calendar/connectionHooks'
import { IST_FIELD } from '@/lib/time/ist'

/**
 * A time a practitioner's own calendar says they are busy (docs/04 `busy_blocks`; D-22, B14):
 * a start and an end, nothing else, read from Google's free/busy answer. The server replaces a
 * practitioner's blocks for the horizon each time it reads them; nobody writes one by hand.
 * Not in the audit log: copies of another system's times, refreshed every 15 minutes, holding
 * nobody's details (src/plugins/auditLog.ts).
 */
export const BusyBlocks: CollectionConfig = {
  slug: 'busy-blocks',
  labels: { singular: 'Busy time', plural: 'Busy times' },
  admin: {
    group: 'Calendar',
    defaultColumns: ['practitioner', 'startsAt', 'endsAt'],
    hidden: ({ user }) => !hasRole(user, 'owner', 'operator', 'practitioner'),
    description: 'Read from each practitioner’s calendar. Never bookable.',
  },
  access: {
    read: allow(POLICY.busyBlocks.read),
    create: allow(POLICY.busyBlocks.create),
    update: allow(POLICY.busyBlocks.update),
    delete: allow(POLICY.busyBlocks.delete),
  },
  // The server writes them from free/busy (src/lib/calendar/sync.ts); each ends after it starts.
  hooks: { beforeChange: [busyBlockInOrder] },
  defaultSort: 'startsAt',
  disableBulkEdit: true,
  lockDocuments: false,
  timestamps: false,
  indexes: [{ fields: ['practitioner', 'startsAt'] }],
  fields: [
    {
      name: 'practitioner',
      type: 'relationship',
      relationTo: 'practitioners',
      required: true,
      index: true,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'startsAt',
          type: 'date',
          label: 'From',
          required: true,
          timezone: IST_FIELD,
          admin: { date: { pickerAppearance: 'dayAndTime' } },
        },
        {
          name: 'endsAt',
          type: 'date',
          label: 'Until',
          required: true,
          timezone: IST_FIELD,
          admin: { date: { pickerAppearance: 'dayAndTime' } },
        },
      ],
    },
    {
      name: 'source',
      type: 'select',
      required: true,
      defaultValue: 'google',
      options: [{ label: 'Google Calendar', value: 'google' }],
    },
  ],
}
