import type { CollectionConfig } from 'payload'

import { allow, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { basisPointsField, paiseField, wholeNumber } from '@/fields/numbers'
import { IST_FIELD } from '@/lib/time/ist'

/**
 * Every price a service's option has had, and from when to when (docs/04 `price_history`;
 * docs/08 §4: from 1 January 2027 a reduced price shows the lowest price of the previous 30
 * days). Written by the server when an owner saves a service with a changed price, never by hand;
 * the open row (no `validTo`) is the price in force. Read by the staff who see prices.
 */
export const PriceHistory: CollectionConfig = {
  slug: 'price-history',
  labels: { singular: 'Price', plural: 'Price history' },
  admin: {
    group: 'Money',
    defaultColumns: ['service', 'optionLabel', 'pricePaise', 'validFrom', 'validTo'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.priceHistory.read.roles),
    description: 'Each price a service has had. Written by the platform when a price changes.',
  },
  access: {
    read: allow(POLICY.priceHistory.read),
    create: allow(POLICY.priceHistory.create),
    update: allow(POLICY.priceHistory.update),
    delete: allow(POLICY.priceHistory.delete),
  },
  defaultSort: '-validFrom',
  disableBulkEdit: true,
  timestamps: false,
  indexes: [{ fields: ['service', 'serviceOption', 'validFrom'], unique: true }],
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'service', type: 'relationship', relationTo: 'services', required: true },
        // Payload's id of the service's options row.
        { name: 'serviceOption', type: 'text', label: 'Option', required: true, maxLength: 64 },
        { name: 'optionLabel', type: 'text', label: 'Option as named', maxLength: 100 },
        {
          name: 'durationMinutes',
          type: 'number',
          label: 'Length (minutes)',
          min: 1,
          validate: wholeNumber('the length'),
        },
      ],
    },
    {
      type: 'row',
      fields: [
        paiseField('pricePaise', 'Price (all-in)', { required: true }),
        { name: 'gstInclusive', type: 'checkbox', label: 'Includes GST' },
        basisPointsField('gstRateBasisPoints', 'GST rate', '18% is 1800.'),
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'validFrom',
          type: 'date',
          label: 'From',
          required: true,
          timezone: IST_FIELD,
          admin: { date: { pickerAppearance: 'dayAndTime' } },
        },
        {
          name: 'validTo',
          type: 'date',
          label: 'Until',
          timezone: IST_FIELD,
          admin: { date: { pickerAppearance: 'dayAndTime' } },
        },
      ],
    },
  ],
}
