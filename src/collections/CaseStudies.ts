import type { CollectionConfig, FieldAccess } from 'payload'

import { allow, allowField, FIELD_POLICY, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { istDayField } from '@/fields/istDay'

/** A case study's address under /proof: small letters, digits and single hyphens. */
const CASE_STUDY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const CASE_STUDY_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'awaitingApproval', label: 'Waiting for the client’s approval' },
  { value: 'approved', label: 'Approved by the client' },
  { value: 'published', label: 'Published' },
  { value: 'withdrawn', label: 'Withdrawn' },
] as const

const approval = {
  read: allowField(FIELD_POLICY.caseStudyApproval.read),
  create: allowField(FIELD_POLICY.caseStudyApproval.write),
  update: allowField(FIELD_POLICY.caseStudyApproval.write),
}

/** Set by the platform when an owner publishes. */
const serverWritten: { create: FieldAccess; update: FieldAccess } = {
  create: () => false,
  update: () => false,
}

/**
 * A case study (docs/04 `case_studies`; docs/05, Proof; docs/08 §6; docs/18 §6): an organisation's
 * problem, IIIC's approach and the outcomes, each outcome with its evidence; published only with
 * the client's written approval recorded and by an owner (the publish rule is builder C's hook,
 * as Testimonials has its own). Anyone reads a published one, never the approval record. The
 * client is named as text until M4's `organisations` joins, when the link is added beside it.
 */
export const CaseStudies: CollectionConfig = {
  slug: 'case-studies',
  labels: { singular: 'Case study', plural: 'Case studies' },
  admin: {
    group: 'Proof',
    useAsTitle: 'title',
    defaultColumns: ['title', 'clientName', 'status', 'updatedAt'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.caseStudies.read.roles),
  },
  access: {
    read: allow(POLICY.caseStudies.read),
    create: allow(POLICY.caseStudies.create),
    update: allow(POLICY.caseStudies.update),
    delete: allow(POLICY.caseStudies.delete),
  },
  defaultSort: '-updatedAt',
  disableBulkEdit: true,
  fields: [
    { name: 'title', type: 'text', required: true, maxLength: 120 },
    {
      name: 'slug',
      type: 'text',
      label: 'Address',
      required: true,
      unique: true,
      index: true,
      maxLength: 80,
      validate: (value: unknown) =>
        (typeof value === 'string' && CASE_STUDY_SLUG.test(value)) ||
        'Use small letters, numbers and hyphens, such as team-alignment-2026.',
    },
    {
      type: 'row',
      fields: [
        { name: 'clientName', type: 'text', label: 'Client', required: true, maxLength: 160 },
        { name: 'sector', type: 'text', maxLength: 100 },
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'draft',
          index: true,
          options: [...CASE_STUDY_STATUSES],
        },
      ],
    },
    { name: 'problem', type: 'textarea', required: true, maxLength: 2000 },
    { name: 'approach', type: 'textarea', required: true, maxLength: 3000 },
    {
      name: 'outcomes',
      type: 'array',
      minRows: 1,
      maxRows: 8,
      labels: { singular: 'Outcome', plural: 'Outcomes' },
      fields: [
        { name: 'statement', type: 'textarea', required: true, maxLength: 500 },
        {
          // docs/05: "an evidence field per number". What shows the outcome happened, and where
          // the proof is kept; never published as it is.
          name: 'evidence',
          type: 'textarea',
          required: true,
          maxLength: 1000,
          access: approval,
        },
      ],
    },
    {
      name: 'clientApproval',
      type: 'group',
      label: 'Client’s approval',
      access: approval,
      admin: {
        description:
          'Required before publishing: who at the client approved the names and numbers, when, and where the signed approval is kept.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'approverName', type: 'text', label: 'Approved by', maxLength: 120 },
            { name: 'approverRole', type: 'text', label: 'Their role', maxLength: 120 },
            istDayField('approvedOn', 'Approved on'),
          ],
        },
        {
          // Until the private documents bucket, the file stays where IIIC keeps it, as a review's
          // original does (docs/04, `testimonials` as built).
          name: 'reference',
          type: 'text',
          label: 'Where the signed approval is kept',
          maxLength: 300,
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'publishedBy',
          type: 'relationship',
          relationTo: 'users',
          access: { ...serverWritten, read: approval.read },
          admin: { readOnly: true },
        },
        {
          name: 'publishedAt',
          type: 'date',
          access: serverWritten,
          admin: { readOnly: true, date: { pickerAppearance: 'dayOnly' } },
        },
      ],
    },
  ],
}
