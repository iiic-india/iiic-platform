import type { CollectionConfig } from 'payload'

import { allow, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { CHANNELS, SUPPRESSION_REASONS } from '@/lib/messaging/types'
import { IST_FIELD } from '@/lib/time/ist'

/**
 * Addresses nothing is sent to (docs/13 §6: "hard bounces and complaints mark the address invalid
 * the same day and stop every send to it"; §7: STOP on WhatsApp; docs/06 O9). One entry per
 * channel and address, checked by the core before every send (src/lib/messaging/policy.ts), so a
 * newsletter subscriber who is not yet a person is covered too; the person, when known, shows it
 * on their record. Written by the providers' webhooks (builder A) and by the office for a request
 * that came another way; only an owner lifts one, once the person has given an address that works.
 */
export const Suppressions: CollectionConfig = {
  slug: 'suppressions',
  labels: { singular: 'Suppressed address', plural: 'Suppressed addresses' },
  admin: {
    group: 'Messages',
    useAsTitle: 'address',
    defaultColumns: ['address', 'channel', 'reason', 'at', 'source'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.suppressions.read.roles),
    description: 'Addresses that bounced, complained or asked to stop. Nothing is sent to them.',
  },
  access: {
    read: allow(POLICY.suppressions.read),
    create: allow(POLICY.suppressions.create),
    update: allow(POLICY.suppressions.update),
    delete: allow(POLICY.suppressions.delete),
  },
  defaultSort: '-at',
  disableBulkEdit: true,
  indexes: [{ fields: ['channel', 'address'], unique: true }],
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'channel', type: 'select', required: true, options: [...CHANNELS] },
        {
          name: 'address',
          type: 'text',
          required: true,
          maxLength: 254,
          admin: { description: 'An email address in small letters, or a mobile with +91.' },
          hooks: {
            beforeValidate: [
              ({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
            ],
          },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'reason', type: 'select', required: true, options: [...SUPPRESSION_REASONS] },
        {
          name: 'at',
          type: 'date',
          required: true,
          defaultValue: () => new Date().toISOString(),
          timezone: IST_FIELD,
          admin: { date: { pickerAppearance: 'dayAndTime' } },
        },
        {
          name: 'source',
          type: 'select',
          required: true,
          defaultValue: 'staff',
          options: [
            { label: 'Email provider', value: 'resend' },
            { label: 'WhatsApp provider', value: 'whatsapp' },
            { label: 'Staff', value: 'staff' },
          ],
        },
      ],
    },
    { name: 'person', type: 'relationship', relationTo: 'people', index: true },
    {
      name: 'note',
      type: 'textarea',
      maxLength: 500,
      admin: { description: 'For an entry made by hand: how the request reached IIIC.' },
    },
  ],
}
