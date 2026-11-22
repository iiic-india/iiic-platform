import type { CollectionConfig, Field } from 'payload'

import { allow, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { paiseField } from '@/fields/numbers'
import { GATEWAYS, PAYMENT_KINDS, PAYMENT_STATUSES } from '@/lib/payments/states'
import { IST_FIELD } from '@/lib/time/ist'

const instant = (name: string, label: string): Field => ({
  name,
  type: 'date',
  label,
  timezone: IST_FIELD,
  admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
})

const gatewayId = (name: string, label: string): Field => ({
  name,
  type: 'text',
  label,
  unique: true,
  maxLength: 64,
  admin: { readOnly: true },
})

/**
 * A payment (docs/04 `payments`, S2): one gateway order opened at checkout, or one payment link
 * staff send (D-24), with the payment captured on it. Its truth is the gateway's: it is written
 * only by the server, from a verified webhook, a server-side verification of the order or the
 * daily reconciliation, each processed once (CLAUDE.md #5; docs/16 §5). Amounts are integer paise.
 * Card and bank details never reach the platform (hosted checkout, PCI DSS SAQ A).
 */
export const Payments: CollectionConfig = {
  slug: 'payments',
  labels: { singular: 'Payment', plural: 'Payments' },
  admin: {
    group: 'Money',
    defaultColumns: ['booking', 'kind', 'amountPaise', 'status', 'capturedAt'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.payments.read.roles),
  },
  access: {
    read: allow(POLICY.payments.read),
    create: allow(POLICY.payments.create),
    update: allow(POLICY.payments.update),
    delete: allow(POLICY.payments.delete),
  },
  defaultSort: '-createdAt',
  disableBulkEdit: true,
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'booking',
          type: 'relationship',
          relationTo: 'bookings',
          required: true,
          index: true,
        },
        { name: 'kind', type: 'select', required: true, options: [...PAYMENT_KINDS] },
        {
          name: 'gateway',
          type: 'select',
          required: true,
          defaultValue: 'razorpay',
          options: [...GATEWAYS],
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'created',
          index: true,
          options: [...PAYMENT_STATUSES],
        },
      ],
    },
    {
      type: 'row',
      fields: [
        // Razorpay takes no order under ₹1 (100 paise).
        paiseField('amountPaise', 'Amount', { required: true, min: 100 }),
        {
          name: 'currency',
          type: 'select',
          required: true,
          defaultValue: 'INR',
          options: [{ label: 'Indian rupees', value: 'INR' }],
        },
        paiseField('refundedPaise', 'Refunded so far', { defaultValue: 0 }),
      ],
    },
    {
      // Sent to the gateway with the order or link and unique here: opening checkout twice for
      // one booking finds the order already made (docs/03 F3, duplicate submissions).
      name: 'receipt',
      type: 'text',
      required: true,
      unique: true,
      maxLength: 40,
      admin: { readOnly: true },
    },
    {
      type: 'row',
      fields: [
        gatewayId('gatewayOrderId', 'Gateway order'),
        gatewayId('gatewayPaymentLinkId', 'Gateway payment link'),
        gatewayId('gatewayPaymentId', 'Gateway payment'),
      ],
    },
    {
      type: 'row',
      fields: [
        {
          // upi, card, netbanking, wallet: as the gateway names it, nothing more about the payer.
          name: 'method',
          type: 'text',
          maxLength: 30,
          admin: { readOnly: true },
        },
        {
          // The gateway's error code for the last failed attempt, never its description, which
          // can quote the payer.
          name: 'failureCode',
          type: 'text',
          maxLength: 64,
          admin: { readOnly: true },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        instant('capturedAt', 'Captured'),
        instant('linkSentAt', 'Link sent'),
        instant('expiresAt', 'Expires'),
      ],
    },
  ],
}
