import type { CollectionConfig, Field } from 'payload'

import { allow, allowField, FIELD_POLICY, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { istDayField } from '@/fields/istDay'
import { paiseField } from '@/fields/numbers'
import { proposalEndpoints } from '@/lib/pipeline/proposal/endpoints'
import { giveReference, workOutFeeTotal } from '@/lib/pipeline/proposal/hooks'
import { PROPOSAL_STATUSES } from '@/lib/pipeline/values'
import { IST_FIELD } from '@/lib/time/ist'

const serverOnly = {
  read: allowField(FIELD_POLICY.serverOnly.read),
  create: allowField(FIELD_POLICY.serverOnly.write),
  update: allowField(FIELD_POLICY.serverOnly.write),
}

const fees = {
  read: allowField(FIELD_POLICY.proposalFees.read),
  create: allowField(FIELD_POLICY.proposalFees.write),
  update: allowField(FIELD_POLICY.proposalFees.write),
}

const feeTotal = {
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

const words = (name: string, label: string, description: string): Field => ({
  name,
  type: 'textarea',
  label,
  maxLength: 4000,
  admin: { description },
})

/**
 * A proposal (docs/04 `proposals`; docs/05 "Send a proposal"; docs/17 §5): the working copy the
 * office drafts for a lead, in the kit's proposal template's parts (`print/proposal.html`): the
 * situation, the approach, the phases, the measures, the fees and the next step. Every word and
 * every fee is typed by IIIC's staff; nothing here is a default, and the fees are an owner's
 * (FIELD_POLICY.proposalFees). Each "Create version" freezes it as a `proposal-versions` entry,
 * which is what is printed, sent and tracked; the status follows PROPOSAL_MOVES. The actions
 * (version, preview, send, record the answer) and their hooks are the proposal builder's
 * (docs/17 §11). The fees print only while fees may (docs/17 §5, D-21).
 */
export const Proposals: CollectionConfig = {
  slug: 'proposals',
  labels: { singular: 'Proposal', plural: 'Proposals' },
  admin: {
    group: 'Pipeline',
    useAsTitle: 'title',
    defaultColumns: ['reference', 'title', 'lead', 'status', 'updatedAt'],
    listSearchableFields: ['reference', 'title'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.proposals.read.roles),
  },
  access: {
    read: allow(POLICY.proposals.read),
    create: allow(POLICY.proposals.create),
    update: allow(POLICY.proposals.update),
    delete: allow(POLICY.proposals.delete),
  },
  defaultSort: '-createdAt',
  disableBulkEdit: true,
  // The reference and the fees' total are the platform's (src/lib/pipeline/proposal/hooks.ts).
  hooks: { beforeChange: [giveReference, workOutFeeTotal] },
  // Create version, preview, record the answer: each checks the user, the role and the code
  // first (src/lib/pipeline/proposal/endpoints.ts).
  endpoints: proposalEndpoints,
  fields: [
    {
      type: 'row',
      fields: [
        {
          // IIIC-P-24117, given by the platform; a version prints it with its number.
          name: 'reference',
          type: 'text',
          unique: true,
          maxLength: 20,
          access: serverOnly,
          admin: { readOnly: true },
        },
        { name: 'lead', type: 'relationship', relationTo: 'leads', required: true, index: true },
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'draft',
          index: true,
          options: [...PROPOSAL_STATUSES],
          access: serverOnly,
          admin: { readOnly: true },
        },
      ],
    },
    { name: 'title', type: 'text', required: true, maxLength: 200 },
    { name: 'subtitle', type: 'text', maxLength: 300 },
    {
      type: 'row',
      fields: [
        {
          name: 'preparedByName',
          type: 'text',
          label: 'Prepared by',
          maxLength: 120,
          admin: { description: 'The name printed under "Prepared by".' },
        },
        {
          name: 'preparedByTitle',
          type: 'text',
          label: 'Their title',
          maxLength: 120,
        },
        istDayField('validUntil', 'Valid until', {
          description: 'The last day it stands, if IIIC gives one. Empty: it does not expire.',
        }),
      ],
    },
    words('situation', 'The situation', 'What the client faces, as IIIC understood it.'),
    words('approach', 'The approach', 'How IIIC proposes to work on it.'),
    {
      name: 'phases',
      type: 'array',
      maxRows: 12,
      labels: { singular: 'Phase', plural: 'Phases' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'name', type: 'text', required: true, maxLength: 120 },
            { name: 'duration', type: 'text', required: true, maxLength: 60 },
          ],
        },
        { name: 'what', type: 'textarea', label: 'What happens', required: true, maxLength: 1000 },
        { name: 'outcome', type: 'textarea', required: true, maxLength: 1000 },
      ],
    },
    words('measures', 'How progress is measured', 'What IIIC and the client will look at.'),
    {
      // Quoted prices, before GST (the template prints "Total, excluding GST").
      name: 'fees',
      type: 'array',
      maxRows: 20,
      labels: { singular: 'Fee', plural: 'Fees' },
      access: fees,
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'item', type: 'text', required: true, maxLength: 200 },
            paiseField('amountPaise', 'Amount', { required: true, min: 100 }),
          ],
        },
      ],
    },
    paiseField('feeTotalPaise', 'Total, excluding GST', {
      access: feeTotal,
      description: 'The sum of the fees, worked out by the platform.',
    }),
    words('nextStep', 'The next step', 'What the client does to go ahead.'),
    {
      type: 'row',
      fields: [
        {
          name: 'currentVersion',
          type: 'relationship',
          relationTo: 'proposal-versions',
          access: serverOnly,
          admin: { readOnly: true, description: 'The latest version made.' },
        },
        {
          name: 'sentVersion',
          type: 'relationship',
          relationTo: 'proposal-versions',
          access: serverOnly,
          admin: { readOnly: true, description: 'The version the client has.' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        instant('acceptedAt', 'Accepted'),
        instant('declinedAt', 'Declined'),
        instant('expiredAt', 'Expired'),
      ],
    },
    {
      name: 'answerNote',
      type: 'textarea',
      label: 'What the client said',
      maxLength: 1000,
      admin: { description: 'When they accept or decline, in the office’s words.' },
    },
    {
      name: 'versions',
      type: 'join',
      collection: 'proposal-versions',
      on: 'proposal',
      defaultSort: '-number',
      admin: { allowCreate: false, defaultColumns: ['number', 'createdAt', 'feeTotalPaise'] },
    },
  ],
}
