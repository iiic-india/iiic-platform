import type { CollectionConfig, Field } from 'payload'

import { allow, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { paiseField } from '@/fields/numbers'
import { GATEWAY_EVENT_OUTCOMES, GATEWAY_EVENT_SOURCES, GATEWAYS } from '@/lib/payments/states'
import { IST_FIELD } from '@/lib/time/ist'

const gatewayId = (name: string, label: string): Field => ({
  name,
  type: 'text',
  label,
  index: true,
  maxLength: 64,
})

/**
 * Each event from the gateway, once (docs/04: "Webhook events are stored by provider event id
 * and processed once"; CLAUDE.md #5). The webhook stores an event in the same transaction that
 * acts on it; the unique (gateway, eventId) index makes a replay of the same event find it
 * already there and do nothing (docs/16 §5). The order-status poll and the daily reconciliation
 * write their findings here too, under ids of their own, so a capture they find is acted on
 * once as well.
 *
 * Only what the platform needs is kept: the event's type, the gateway's ids and the amount.
 * The payload itself, which names the payer, is never stored or logged.
 */
export const GatewayEvents: CollectionConfig = {
  slug: 'gateway-events',
  labels: { singular: 'Gateway event', plural: 'Gateway events' },
  admin: {
    group: 'Money',
    useAsTitle: 'eventId',
    defaultColumns: ['receivedAt', 'type', 'source', 'outcome', 'gatewayPaymentId'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.gatewayEvents.read.roles),
    description: 'Every event from the payment gateway, each processed once.',
  },
  access: {
    read: allow(POLICY.gatewayEvents.read),
    create: allow(POLICY.gatewayEvents.create),
    update: allow(POLICY.gatewayEvents.update),
    delete: allow(POLICY.gatewayEvents.delete),
  },
  defaultSort: '-receivedAt',
  disableBulkEdit: true,
  lockDocuments: false,
  timestamps: false,
  indexes: [{ fields: ['gateway', 'eventId'], unique: true }],
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'gateway',
          type: 'select',
          required: true,
          defaultValue: 'razorpay',
          options: [...GATEWAYS],
        },
        {
          // The gateway's own id for the event (Razorpay's X-Razorpay-Event-Id), or the poll's
          // and the reconciliation's id for what they found.
          name: 'eventId',
          type: 'text',
          required: true,
          maxLength: 100,
        },
        { name: 'type', type: 'text', required: true, maxLength: 60 },
        { name: 'source', type: 'select', required: true, options: [...GATEWAY_EVENT_SOURCES] },
      ],
    },
    {
      type: 'row',
      fields: [
        gatewayId('gatewayOrderId', 'Order'),
        gatewayId('gatewayPaymentLinkId', 'Payment link'),
        gatewayId('gatewayPaymentId', 'Payment'),
        gatewayId('gatewayRefundId', 'Refund'),
      ],
    },
    {
      type: 'row',
      fields: [
        paiseField('amountPaise', 'Amount'),
        { name: 'payment', type: 'relationship', relationTo: 'payments', index: true },
        { name: 'refund', type: 'relationship', relationTo: 'refunds' },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'receivedAt',
          type: 'date',
          required: true,
          index: true,
          timezone: IST_FIELD,
          admin: { date: { pickerAppearance: 'dayAndTime' } },
        },
        { name: 'outcome', type: 'select', required: true, options: [...GATEWAY_EVENT_OUTCOMES] },
        {
          // A short code for what was flagged or ignored, such as slot-taken or unknown-order.
          name: 'note',
          type: 'text',
          maxLength: 100,
        },
      ],
    },
  ],
}
