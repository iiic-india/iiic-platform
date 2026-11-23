import type { CollectionConfig } from 'payload'

import { allow, allowField, FIELD_POLICY, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { prepareActivity, stampLeadFromActivity } from '@/lib/pipeline/core/hooks'
import { LEAD_STAGES } from '@/lib/pipeline/stages'
import { ACTIVITY_TYPES } from '@/lib/pipeline/values'
import { IST_FIELD } from '@/lib/time/ist'

const serverOnly = {
  read: allowField(FIELD_POLICY.serverOnly.read),
  create: allowField(FIELD_POLICY.serverOnly.write),
  update: allowField(FIELD_POLICY.serverOnly.write),
}

/**
 * One entry in a lead's timeline (docs/04 `lead_activities`; docs/17 §2): a note, a call, an
 * email or a WhatsApp message the office logs, a file it keeps elsewhere, and what the platform
 * records itself (a stage change, a request received, a proposal made, sent or answered, a call
 * booked). Written once and never changed (src/access/policy.ts). Each entry keeps the lead's
 * `lastActivityAt` and, for staff entries, its `touchedAt`: the CRM builder's hooks (docs/17
 * §11). The words are the office's own; nothing from counselling belongs here (CLAUDE.md #3).
 */
export const LeadActivities: CollectionConfig = {
  slug: 'lead-activities',
  labels: { singular: 'Lead activity', plural: 'Lead activities' },
  admin: {
    group: 'Pipeline',
    defaultColumns: ['lead', 'type', 'at', 'by'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.leadActivities.read.roles),
  },
  access: {
    read: allow(POLICY.leadActivities.read),
    create: allow(POLICY.leadActivities.create),
    update: allow(POLICY.leadActivities.update),
    delete: allow(POLICY.leadActivities.delete),
  },
  defaultSort: '-at',
  disableBulkEdit: true,
  // Staff types only, never changed, and the lead's last activity and first action
  // (src/lib/pipeline/core/hooks.ts).
  hooks: { beforeChange: [prepareActivity], afterChange: [stampLeadFromActivity] },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'lead', type: 'relationship', relationTo: 'leads', required: true, index: true },
        { name: 'type', type: 'select', required: true, options: [...ACTIVITY_TYPES] },
        {
          name: 'at',
          type: 'date',
          required: true,
          index: true,
          timezone: IST_FIELD,
          defaultValue: () => new Date().toISOString(),
          admin: {
            date: { pickerAppearance: 'dayAndTime' },
            description: 'When it happened, if not now.',
          },
        },
      ],
    },
    {
      name: 'body',
      type: 'textarea',
      label: 'What happened',
      maxLength: 4000,
      admin: { description: 'In the office’s own words. No session content.' },
    },
    {
      // Until the private documents bucket holds files (docs/16 §10), where the file is kept.
      name: 'fileReference',
      type: 'text',
      label: 'Where the file is kept',
      maxLength: 300,
      admin: { condition: (data) => data?.type === 'file' },
    },
    {
      type: 'row',
      fields: [
        {
          // Empty when the platform wrote it.
          name: 'by',
          type: 'relationship',
          relationTo: 'users',
          access: serverOnly,
          admin: { readOnly: true },
        },
        {
          name: 'fromStage',
          type: 'select',
          options: [...LEAD_STAGES],
          access: serverOnly,
          admin: { readOnly: true, condition: (data) => data?.type === 'stageChange' },
        },
        {
          name: 'toStage',
          type: 'select',
          options: [...LEAD_STAGES],
          access: serverOnly,
          admin: { readOnly: true, condition: (data) => data?.type === 'stageChange' },
        },
      ],
    },
    {
      // What a platform entry is about.
      type: 'row',
      fields: [
        {
          name: 'enquiry',
          type: 'relationship',
          relationTo: 'enquiries',
          access: serverOnly,
          admin: { readOnly: true, condition: (data) => data?.type === 'enquiry' },
        },
        {
          name: 'proposalVersion',
          type: 'relationship',
          relationTo: 'proposal-versions',
          access: serverOnly,
          admin: { readOnly: true, condition: (data) => data?.type === 'proposal' },
        },
        {
          name: 'booking',
          type: 'relationship',
          relationTo: 'bookings',
          access: serverOnly,
          admin: { readOnly: true, condition: (data) => data?.type === 'booking' },
        },
      ],
    },
  ],
}
