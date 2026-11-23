import type { CollectionConfig, Field } from 'payload'

import { allow, allowField, FIELD_POLICY, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { closeSpamLead } from '@/lib/pipeline/core/hooks'
import { ENQUIRY_CONFLICTS } from '@/lib/pipeline/core/strings'
import {
  ENQUIRY_KINDS,
  ENQUIRY_OUTCOMES,
  ENQUIRY_STATUSES,
  TEAM_SIZE_BANDS,
  TURNSTILE_OUTCOMES,
} from '@/lib/pipeline/values'
import { IST_FIELD } from '@/lib/time/ist'

const serverOnly = {
  read: allowField(FIELD_POLICY.serverOnly.read),
  create: allowField(FIELD_POLICY.serverOnly.write),
  update: allowField(FIELD_POLICY.serverOnly.write),
}

const kept = (field: Field): Field =>
  ({ ...field, access: serverOnly, admin: { ...field.admin, readOnly: true } }) as Field

/**
 * What a public form received (docs/03 F5, F12; docs/17 §2, §6): a Team Map request or a
 * partnership enquiry, exactly as typed (S2: it holds contact details), with the person, the
 * organisation and the lead the platform matched it to, and the consents recorded before it was
 * stored (CLAUDE.md #4). A form never changes a person's or an organisation's record; the office
 * compares this copy with theirs. Made by the server alone (`receiveEnquiry`, the CRM builder's);
 * the office may mark one as spam and nothing else. The person's erasure deletes their enquiries
 * (docs/17 §9). `submitterHash` is a daily, keyed hash of the network address for the forms'
 * rate limits, never the address itself, and nobody reads it.
 */
export const Enquiries: CollectionConfig = {
  slug: 'enquiries',
  labels: { singular: 'Enquiry', plural: 'Enquiries' },
  admin: {
    group: 'Pipeline',
    defaultColumns: ['kind', 'receivedAt', 'status', 'outcome', 'lead'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.enquiries.read.roles),
  },
  access: {
    read: allow(POLICY.enquiries.read),
    create: allow(POLICY.enquiries.create),
    update: allow(POLICY.enquiries.update),
    delete: allow(POLICY.enquiries.delete),
  },
  defaultSort: '-receivedAt',
  disableBulkEdit: true,
  // Marked as spam, the lead it made ends (src/lib/pipeline/core/hooks.ts).
  hooks: { afterChange: [closeSpamLead] },
  fields: [
    {
      type: 'row',
      fields: [
        kept({ name: 'kind', type: 'select', required: true, options: [...ENQUIRY_KINDS] }),
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'received',
          index: true,
          options: [...ENQUIRY_STATUSES],
          admin: { description: 'Mark as spam to keep it off the boards.' },
        },
        kept({ name: 'outcome', type: 'select', options: [...ENQUIRY_OUTCOMES] }),
        kept({
          name: 'receivedAt',
          type: 'date',
          required: true,
          index: true,
          timezone: IST_FIELD,
          admin: { date: { pickerAppearance: 'dayAndTime' } },
        }),
      ],
    },
    {
      // The form's fields as the person typed them (docs/03 F5 step 1; F12).
      name: 'submitted',
      type: 'group',
      label: 'As sent',
      fields: [
        {
          type: 'row',
          fields: [
            kept({ name: 'organisationName', type: 'text', required: true, maxLength: 200 }),
            kept({ name: 'website', type: 'text', maxLength: 200 }),
            kept({
              name: 'teamSizeBand',
              type: 'select',
              label: 'Team size',
              options: [...TEAM_SIZE_BANDS],
            }),
            kept({ name: 'sector', type: 'text', maxLength: 100 }),
          ],
        },
        {
          type: 'row',
          fields: [
            kept({ name: 'contactName', type: 'text', required: true, maxLength: 200 }),
            kept({ name: 'role', type: 'text', maxLength: 100 }),
            kept({ name: 'email', type: 'email', required: true }),
            kept({ name: 'mobile', type: 'text', maxLength: 20 }),
          ],
        },
        kept({
          // What prompted a Team Map request, or the nature of a partnership enquiry.
          name: 'message',
          type: 'textarea',
          maxLength: 2000,
        }),
      ],
    },
    {
      type: 'row',
      fields: [
        kept({ name: 'person', type: 'relationship', relationTo: 'people', index: true }),
        kept({
          name: 'organisation',
          type: 'relationship',
          relationTo: 'organisations',
          index: true,
        }),
        kept({ name: 'lead', type: 'relationship', relationTo: 'leads', index: true }),
      ],
    },
    kept({
      // What matching found for the office to look at (docs/17 §4, step 1): the email and the
      // mobile point at two people; the email's is linked.
      name: 'conflict',
      type: 'select',
      label: 'Matching',
      options: [...ENQUIRY_CONFLICTS],
    }),
    kept({
      // The consents given on the form, recorded before this enquiry (CLAUDE.md #4).
      name: 'consents',
      type: 'relationship',
      relationTo: 'consents',
      hasMany: true,
    }),
    {
      type: 'row',
      fields: [
        kept({
          // The page the form was on, such as /organisations/team-map.
          name: 'page',
          type: 'text',
          maxLength: 200,
        }),
        kept({ name: 'turnstile', type: 'select', options: [...TURNSTILE_OUTCOMES] }),
      ],
    },
    {
      name: 'utm',
      type: 'group',
      label: 'Campaign (UTM)',
      fields: [
        {
          type: 'row',
          fields: ['source', 'medium', 'campaign', 'term', 'content'].map((name) =>
            kept({ name, type: 'text', maxLength: 200 }),
          ),
        },
      ],
    },
    { name: 'submitterHash', type: 'text', index: true, maxLength: 64, hidden: true },
  ],
}
