import type { CollectionConfig } from 'payload'

import { allow, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { IST_FIELD } from '@/lib/time/ist'

const hidden = { read: () => false, create: () => false, update: () => false }

const date = (name: string, label: string) => ({
  name,
  type: 'date' as const,
  label,
  timezone: IST_FIELD,
  admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' as const } },
})

/**
 * The newsletter list (docs/04 `subscribers`; D-10; docs/19 §8). A signup is `pending` and holds
 * only the address, the notice shown and a hash of the confirmation token, for as long as the
 * confirmation link lives (7 days; O5 removes it after): the double opt-in email is the reply to
 * the request (N1). On confirmation the consent to marketing email is recorded first, under that
 * notice, and only then does the entry become `confirmed`, linked to the person and the consent
 * (CLAUDE.md #4; N2). An unsubscribe or a complaint records the withdrawal and marks the entry
 * `unsubscribed` (N3). The consent ledger, not this list, decides whether a message goes.
 */
export const Subscribers: CollectionConfig = {
  slug: 'subscribers',
  labels: { singular: 'Subscriber', plural: 'Subscribers' },
  admin: {
    group: 'Messages',
    useAsTitle: 'email',
    defaultColumns: ['email', 'status', 'confirmedAt', 'source'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.subscribers.read.roles),
    description: 'The newsletter list. Each address confirmed its signup by email.',
  },
  access: {
    read: allow(POLICY.subscribers.read),
    create: allow(POLICY.subscribers.create),
    update: allow(POLICY.subscribers.update),
    delete: allow(POLICY.subscribers.delete),
  },
  disableBulkEdit: true,
  fields: [
    {
      name: 'email',
      type: 'email',
      required: true,
      unique: true,
      admin: { readOnly: true },
      hooks: {
        beforeValidate: [
          ({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() || null : value),
        ],
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'pending',
          index: true,
          options: [
            { label: 'Waiting for confirmation', value: 'pending' },
            { label: 'Confirmed', value: 'confirmed' },
            { label: 'Unsubscribed', value: 'unsubscribed' },
          ],
          admin: { readOnly: true },
        },
        {
          name: 'source',
          type: 'text',
          maxLength: 100,
          admin: { readOnly: true, description: 'The page the signup came from.' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'notice',
          type: 'relationship',
          relationTo: 'consent-versions',
          label: 'Notice shown at signup',
          admin: { readOnly: true },
        },
        { name: 'person', type: 'relationship', relationTo: 'people', admin: { readOnly: true } },
        {
          name: 'consent',
          type: 'relationship',
          relationTo: 'consents',
          admin: { readOnly: true },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        date('confirmExpiresAt', 'Link valid until'),
        date('confirmedAt', 'Confirmed'),
        date('unsubscribedAt', 'Unsubscribed'),
        date('lastEngagedAt', 'Last click or reply'),
      ],
    },
    {
      // The SHA-256 of the confirmation token, never readable through the API or the admin.
      name: 'confirmTokenHash',
      type: 'text',
      maxLength: 64,
      index: true,
      access: hidden,
      admin: { hidden: true },
    },
  ],
}
