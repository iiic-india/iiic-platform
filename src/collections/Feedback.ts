import type { CollectionConfig, FieldAccess } from 'payload'

import { allow, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'

/** What the person sent: written by the server from the feedback form, never by staff. */
const theirWords: { create: FieldAccess; update: FieldAccess } = {
  create: () => false,
  update: () => false,
}

export const FEEDBACK_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'read', label: 'Read' },
] as const

/**
 * Feedback after a session (docs/04 `feedback`, private; docs/05, Proof; docs/18 §6): a rating and
 * a comment, written by the server from the feedback form B8 sends (M6), and never published as
 * it is: a review needs its own consent (D-37). The operator reads it and marks it read. Feedback
 * on a counselling session stays with the office: it never reaches marketing, analytics or a
 * message offer (CLAUDE.md #3). Deleting the person deletes it (docs/04, Rules).
 */
export const Feedback: CollectionConfig = {
  slug: 'feedback',
  labels: { singular: 'Feedback', plural: 'Feedback' },
  admin: {
    group: 'Proof',
    useAsTitle: 'id',
    defaultColumns: ['booking', 'rating', 'status', 'submittedAt'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.feedback.read.roles),
  },
  access: {
    read: allow(POLICY.feedback.read),
    create: allow(POLICY.feedback.create),
    update: allow(POLICY.feedback.update),
    delete: allow(POLICY.feedback.delete),
  },
  defaultSort: '-submittedAt',
  disableBulkEdit: true,
  fields: [
    {
      type: 'row',
      fields: [
        {
          // One feedback per booking: the form's link is the booking's (B8).
          name: 'booking',
          type: 'relationship',
          relationTo: 'bookings',
          required: true,
          unique: true,
          access: theirWords,
        },
        {
          name: 'person',
          type: 'relationship',
          relationTo: 'people',
          required: true,
          index: true,
          access: theirWords,
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'rating',
          type: 'number',
          required: true,
          min: 1,
          max: 5,
          access: theirWords,
          admin: { step: 1 },
        },
        {
          name: 'submittedAt',
          type: 'date',
          required: true,
          index: true,
          access: theirWords,
          admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'new',
          index: true,
          options: [...FEEDBACK_STATUSES],
        },
      ],
    },
    { name: 'comment', type: 'textarea', maxLength: 2000, access: theirWords },
  ],
}
