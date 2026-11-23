import type { CollectionConfig, Field } from 'payload'

import { allow, allowField, FIELD_POLICY, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { paiseField } from '@/fields/numbers'
import { IST_FIELD } from '@/lib/time/ist'

const serverOnly = {
  read: allowField(FIELD_POLICY.serverOnly.read),
  create: allowField(FIELD_POLICY.serverOnly.write),
  update: allowField(FIELD_POLICY.serverOnly.write),
}

const fees = {
  read: allowField(FIELD_POLICY.proposalFees.read),
  create: allowField(FIELD_POLICY.serverOnly.write),
  update: allowField(FIELD_POLICY.serverOnly.write),
}

const instant = (name: string, label: string): Field => ({
  name,
  type: 'date',
  label,
  timezone: IST_FIELD,
  access: serverOnly,
  admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
})

/**
 * A proposal as it was frozen (docs/04 `proposals.version`, `PDF`, `sent_at`; docs/17 §5): the
 * exact words, phases and fees printed, numbered 1, 2, 3 per proposal, never changed and never
 * deleted. Its PDF is rendered from `document` through the kit's template (D-09); once the
 * private documents bucket is wired (docs/16 §10) the printed file is stored and its key kept,
 * and its SHA-256 is recorded when it is sent either way. Sending issues a tracked link whose
 * token is shown once and kept only as a hash; opening it records the views. Written by the
 * server alone, after the proposal builder's actions check the user and the role.
 */
export const ProposalVersions: CollectionConfig = {
  slug: 'proposal-versions',
  labels: { singular: 'Proposal version', plural: 'Proposal versions' },
  admin: {
    group: 'Pipeline',
    defaultColumns: ['proposal', 'number', 'createdAt', 'createdBy'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.proposalVersions.read.roles),
  },
  access: {
    read: allow(POLICY.proposalVersions.read),
    create: allow(POLICY.proposalVersions.create),
    update: allow(POLICY.proposalVersions.update),
    delete: allow(POLICY.proposalVersions.delete),
  },
  defaultSort: '-createdAt',
  disableBulkEdit: true,
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'proposal',
          type: 'relationship',
          relationTo: 'proposals',
          required: true,
          index: true,
          access: serverOnly,
          admin: { readOnly: true },
        },
        {
          name: 'number',
          type: 'number',
          required: true,
          min: 1,
          access: serverOnly,
          admin: { readOnly: true },
        },
        {
          name: 'createdBy',
          type: 'relationship',
          relationTo: 'users',
          access: serverOnly,
          admin: { readOnly: true },
        },
      ],
    },
    {
      // The merge fields exactly as printed (ProposalSnapshot, src/lib/pipeline/proposals.ts).
      name: 'document',
      type: 'json',
      required: true,
      access: fees,
      admin: { readOnly: true },
    },
    paiseField('feeTotalPaise', 'Total, excluding GST', { access: fees }),
    {
      name: 'pdf',
      type: 'group',
      label: 'Printed file',
      admin: { readOnly: true },
      fields: [
        {
          type: 'row',
          fields: [
            {
              // The object's key in the private bucket, once one is wired (docs/16 §10).
              name: 'key',
              type: 'text',
              maxLength: 300,
              access: serverOnly,
            },
            { name: 'sha256', type: 'text', label: 'SHA-256', maxLength: 64, access: serverOnly },
            instant('renderedAt', 'Printed'),
          ],
        },
      ],
    },
    {
      name: 'sending',
      type: 'group',
      admin: { readOnly: true },
      fields: [
        {
          type: 'row',
          fields: [
            instant('sentAt', 'Sent'),
            {
              name: 'sentBy',
              type: 'relationship',
              relationTo: 'users',
              access: serverOnly,
            },
            {
              // The person it went to; the address it went to is on their record.
              name: 'sentTo',
              type: 'relationship',
              relationTo: 'people',
              access: serverOnly,
            },
          ],
        },
        {
          type: 'row',
          fields: [
            instant('emailedAt', 'Emailed'),
            instant('supersededAt', 'Replaced'),
            instant('linkRevokedAt', 'Link withdrawn'),
          ],
        },
      ],
    },
    {
      name: 'tracking',
      type: 'group',
      admin: { readOnly: true },
      fields: [
        {
          type: 'row',
          fields: [
            instant('firstViewedAt', 'First opened'),
            instant('lastViewedAt', 'Last opened'),
            {
              name: 'viewCount',
              type: 'number',
              label: 'Times opened',
              min: 0,
              defaultValue: 0,
              access: serverOnly,
            },
          ],
        },
      ],
    },
    {
      // The SHA-256 of the tracked link's token (`/p/[token]`): the token is sent once and never
      // stored. Hidden from every read.
      name: 'linkTokenHash',
      type: 'text',
      unique: true,
      hidden: true,
    },
  ],
}
