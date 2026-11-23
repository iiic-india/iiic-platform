import type { CollectionConfig } from 'payload'

import { allow, allowField, FIELD_POLICY, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { AUTOMATION_IDS } from '@/lib/automations/catalogue'
import { IST_FIELD } from '@/lib/time/ist'

const serverOnly = {
  read: allowField(FIELD_POLICY.serverOnly.read),
  create: allowField(FIELD_POLICY.serverOnly.write),
  update: allowField(FIELD_POLICY.serverOnly.write),
}

/**
 * Each automation's switch and counters (docs/04 `automations`; docs/05 Messages → Automations:
 * "on/off, timing, last run, success and failure counts; each automation can be paused"). One row
 * per automation of the catalogue (src/lib/automations/catalogue.ts), made by the core when it
 * first runs; the trigger and timing are the catalogue's and shown from it. While an automation is
 * paused, each of its messages that comes due is not sent and is marked "paused" in the log, from
 * where staff may queue it again (docs/19 §3).
 */
export const Automations: CollectionConfig = {
  slug: 'automations',
  labels: { singular: 'Automation', plural: 'Automations' },
  admin: {
    group: 'Messages',
    useAsTitle: 'key',
    defaultColumns: ['key', 'enabled', 'lastRunAt', 'successCount', 'failureCount'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.automations.read.roles),
    description: 'Pause or resume an automation; see when it last ran and how often it failed.',
  },
  access: {
    read: allow(POLICY.automations.read),
    create: allow(POLICY.automations.create),
    update: allow(POLICY.automations.update),
    delete: allow(POLICY.automations.delete),
  },
  defaultSort: 'key',
  disableBulkEdit: true,
  fields: [
    {
      name: 'key',
      type: 'select',
      required: true,
      unique: true,
      access: serverOnly,
      options: AUTOMATION_IDS.map((id) => ({ label: id, value: id })),
      admin: { readOnly: true },
    },
    {
      name: 'enabled',
      type: 'checkbox',
      label: 'On',
      defaultValue: true,
      admin: { description: 'Untick to pause it. Nothing it would send goes out while paused.' },
    },
    {
      name: 'note',
      type: 'textarea',
      maxLength: 500,
      admin: { description: 'Why it was paused, for whoever turns it back on.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'lastRunAt',
          type: 'date',
          label: 'Last run',
          timezone: IST_FIELD,
          access: serverOnly,
          admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
        },
        {
          name: 'successCount',
          type: 'number',
          label: 'Succeeded',
          defaultValue: 0,
          access: serverOnly,
          admin: { readOnly: true },
        },
        {
          name: 'failureCount',
          type: 'number',
          label: 'Failed',
          defaultValue: 0,
          access: serverOnly,
          admin: { readOnly: true },
        },
      ],
    },
  ],
}
