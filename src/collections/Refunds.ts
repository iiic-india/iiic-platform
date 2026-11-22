import type { CollectionConfig, Field } from 'payload'

import { allow, allowField, FIELD_POLICY, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { paiseField } from '@/fields/numbers'
import { REFUND_REASONS, REFUND_STATUSES } from '@/lib/payments/states'
import { IST_FIELD } from '@/lib/time/ist'

const serverOnly = {
  read: allowField(FIELD_POLICY.serverOnly.read),
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
 * A refund (docs/04 `refunds`, S2; docs/05, Money and "Refund" in the key workflows): requested
 * with a reason, approved by an owner when above the threshold in Settings, sent through the
 * gateway to the original payment method, and tracked to the gateway's answer (D-16). The
 * automatic refund when two people paid for one time (B10) is requested by the server. The
 * collection holds the record; the moves between states, and who may make each, are the payments
 * builder's (src/lib/payments/, docs/16 §5). Never deleted.
 */
export const Refunds: CollectionConfig = {
  slug: 'refunds',
  labels: { singular: 'Refund', plural: 'Refunds' },
  admin: {
    group: 'Money',
    defaultColumns: ['payment', 'amountPaise', 'reason', 'status', 'createdAt'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.refunds.read.roles),
  },
  access: {
    read: allow(POLICY.refunds.read),
    create: allow(POLICY.refunds.create),
    update: allow(POLICY.refunds.update),
    delete: allow(POLICY.refunds.delete),
  },
  defaultSort: '-createdAt',
  disableBulkEdit: true,
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'payment',
          type: 'relationship',
          relationTo: 'payments',
          required: true,
          index: true,
        },
        { name: 'booking', type: 'relationship', relationTo: 'bookings', index: true },
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'requested',
          index: true,
          options: [...REFUND_STATUSES],
        },
      ],
    },
    {
      type: 'row',
      fields: [
        paiseField('amountPaise', 'Amount', { required: true, min: 100 }),
        { name: 'reason', type: 'select', required: true, options: [...REFUND_REASONS] },
      ],
    },
    {
      name: 'reasonNote',
      type: 'textarea',
      label: 'Why',
      maxLength: 1000,
      admin: { description: 'For the office and the client’s confirmation. No session content.' },
    },
    {
      // Anything the payer asked about where the money goes (docs/08 §4): logged, though the
      // refund always goes to the original payment method.
      name: 'payerInstruction',
      type: 'textarea',
      label: 'Payer’s instruction',
      maxLength: 1000,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'requestedBy',
          type: 'relationship',
          relationTo: 'users',
          access: serverOnly,
          admin: { readOnly: true, description: 'Empty when the platform asked for it (B10).' },
        },
        {
          name: 'approvedBy',
          type: 'relationship',
          relationTo: 'users',
          access: serverOnly,
          admin: { readOnly: true },
        },
        instant('decidedAt', 'Approved or declined'),
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'gatewayRefundId',
          type: 'text',
          label: 'Gateway refund',
          unique: true,
          maxLength: 64,
          access: serverOnly,
          admin: { readOnly: true },
        },
        instant('processedAt', 'Refunded'),
        {
          name: 'failureCode',
          type: 'text',
          maxLength: 64,
          access: serverOnly,
          admin: { readOnly: true },
        },
      ],
    },
    {
      // One refund per cause: a retried webhook or a second click finds this one, and the same
      // key goes to the gateway as the refund's receipt.
      name: 'idempotencyKey',
      type: 'text',
      required: true,
      unique: true,
      maxLength: 64,
      access: serverOnly,
      admin: { readOnly: true },
    },
  ],
}
