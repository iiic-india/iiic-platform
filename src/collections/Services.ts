import type {
  CollectionConfig,
  Field,
  NumberFieldSingleValidation,
  TextFieldSingleValidation,
} from 'payload'
import { number, text } from 'payload/shared'

import { allow, allowField, FIELD_POLICY, POLICY } from '@/access/policy'
import { factsField } from '@/fields/facts'

/**
 * What IIIC offers to book (docs/04 `services`; docs/05, Settings → services and prices): the
 * kind of booking it takes (docs/03 F3), its name and address, its register, its options with
 * their durations and all-in prices, its SAC code, its format (D-03), its booking rules and
 * whether it is offered now. Owners keep it (src/access/policy.ts).
 *
 * Prices live here, never in code, in integer paise. They are stored now for the booking flow
 * (M3) and shown nowhere while prices_public is off (D-21): no page draws them, and a read
 * without a staff sign-in never returns them, nor the GST flag, the SAC code or the booking
 * rules (FIELD_POLICY), so the public API holds a service's name, kind, register, format and
 * option lengths only. The price history the reduced-price rule needs from 1 January 2027
 * (docs/04 `price_history`) comes with the booking flow (docs/10, M3).
 */

/** A single address segment: small letters, numbers and hyphens, such as one-to-one-session. */
export const SERVICE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * A whole number for a field with Payload's own number check: that check runs first, so `min`,
 * `max` and `required` still hold; an empty value is left to them.
 */
function wholeNumber(what: string): NumberFieldSingleValidation {
  return async (value, options) => {
    const base = await number(value, options)
    if (base !== true) return base
    return (
      value === null ||
      value === undefined ||
      Number.isInteger(value) ||
      `Enter ${what} as a whole number.`
    )
  }
}

const validateSlug: TextFieldSingleValidation = async (value, options) => {
  const base = await text(value, options)
  if (base !== true) return base
  return (
    (typeof value === 'string' && SERVICE_SLUG.test(value)) ||
    'Use small letters, numbers and hyphens, such as one-to-one-session.'
  )
}

const validateSac: TextFieldSingleValidation = async (value, options) => {
  const base = await text(value, options)
  if (base !== true) return base
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    /^\d{6}$/.test(value) ||
    'A SAC code is six digits, such as the one the CA gives (I-29).'
  )
}

const prices = {
  read: allowField(FIELD_POLICY.servicePrices.read),
  create: allowField(FIELD_POLICY.servicePrices.write),
  update: allowField(FIELD_POLICY.servicePrices.write),
}

const rules = {
  read: allowField(FIELD_POLICY.serviceBookingRules.read),
  create: allowField(FIELD_POLICY.serviceBookingRules.write),
  update: allowField(FIELD_POLICY.serviceBookingRules.write),
}

/** A booking rule in whole units; left empty, the booking flow uses the default in Settings. */
function rule(name: string, label: string, unit: string, description: string): Field {
  return {
    name,
    type: 'number',
    label,
    min: 0,
    validate: wholeNumber(unit),
    admin: { description, step: 1 },
  }
}

export const Services: CollectionConfig = {
  slug: 'services',
  labels: { singular: 'Service', plural: 'Services' },
  admin: {
    group: 'Settings',
    useAsTitle: 'name',
    defaultColumns: ['name', 'type', 'register', 'format', 'active'],
  },
  // src/access/policy.ts (docs/05): anyone reads an active service's public fields; every staff
  // role reads them all; owners add and change them; nobody deletes one.
  access: {
    read: allow(POLICY.services.read),
    create: allow(POLICY.services.create),
    update: allow(POLICY.services.update),
    delete: allow(POLICY.services.delete),
  },
  // Visitors read active services without signing in, so the staff two-factor wrapper
  // (payload-totp) stays off this one operation; the read rule asks for the code itself before
  // it shows an inactive service, and so do the field rules before a price. Every write still
  // needs a verified code.
  custom: { totp: { disableAccessWrapper: { read: true } } },
  defaultSort: 'name',
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: { description: 'The service’s name, as IIIC calls it (I-11).' },
    },
    {
      name: 'type',
      type: 'select',
      label: 'Kind of booking',
      required: true,
      options: [
        { label: 'Session (counselling)', value: 'session' },
        { label: 'Call (the proposal call)', value: 'call' },
        { label: 'Info session (the course)', value: 'info' },
        { label: 'Course seat (Release 2)', value: 'seat' },
      ],
      admin: { description: 'Which booking flow takes it (docs/03 F3).' },
    },
    {
      name: 'slug',
      type: 'text',
      label: 'Address',
      required: true,
      unique: true,
      index: true,
      validate: validateSlug,
      admin: {
        position: 'sidebar',
        description: 'A short name for links and the booking flow, such as one-to-one-session.',
      },
    },
    {
      name: 'register',
      type: 'select',
      required: true,
      options: [
        { label: 'Consultancy', value: 'consultancy' },
        { label: 'Education', value: 'education' },
        { label: 'Counselling', value: 'counselling' },
      ],
      admin: {
        position: 'sidebar',
        description: 'The door it belongs to, which sets the look of its booking pages.',
      },
    },
    {
      name: 'format',
      type: 'select',
      required: true,
      options: [
        { label: 'Online', value: 'online' },
        { label: 'At the office', value: 'office' },
        { label: 'Online or at the office', value: 'both' },
      ],
      admin: {
        description: 'Where it takes place, as IIIC sets it for this service (D-03, I-08).',
      },
    },
    {
      name: 'options',
      type: 'array',
      labels: { singular: 'Option', plural: 'Options' },
      admin: {
        description:
          'What a client chooses between, such as 15, 30 or 45 minutes. Prices are never shown while they are unpublished (D-21).',
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'label',
              type: 'text',
              admin: { description: 'Optional, such as Individual or Family.', width: '34%' },
            },
            {
              name: 'duration',
              type: 'number',
              label: 'Length in minutes',
              min: 1,
              validate: wholeNumber('the length'),
              admin: { step: 1, width: '33%' },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              // Integer paise (CLAUDE.md #5): ₹1,500 is 150000.
              name: 'price',
              type: 'number',
              label: 'Price in paise',
              min: 0,
              validate: wholeNumber('the price in paise'),
              access: prices,
              admin: {
                description:
                  'The all-in price in paise: ₹1,500 is 150000. Shown nowhere until IIIC publishes prices (D-21, I-28).',
                step: 1,
                width: '50%',
              },
            },
            {
              name: 'gstInclusive',
              type: 'checkbox',
              label: 'The price includes GST',
              defaultValue: true,
              access: prices,
              admin: {
                description:
                  'Prices are all-in (docs/04); untick only if the CA settles otherwise (D-21, I-28).',
                width: '50%',
              },
            },
          ],
        },
      ],
    },
    {
      name: 'sacCode',
      type: 'text',
      label: 'SAC code',
      validate: validateSac,
      access: prices,
      admin: {
        position: 'sidebar',
        description: 'For GST invoices, as the CA classifies the service (I-29).',
      },
    },
    {
      name: 'bookingRules',
      type: 'group',
      label: 'Booking rules',
      access: rules,
      admin: {
        description:
          'Leave a rule empty to use the default in Settings. The cancellation and refund rule waits on IIIC’s policy (D-16, I-07).',
      },
      fields: [
        {
          type: 'row',
          fields: [
            rule(
              'noticeHours',
              'Notice (hours)',
              'the notice',
              'The earliest a booking can start.',
            ),
            rule('horizonDays', 'Horizon (days)', 'the horizon', 'How far ahead it can be booked.'),
            rule(
              'bufferMinutes',
              'Buffer (minutes)',
              'the buffer',
              'Kept free after each booking.',
            ),
          ],
        },
        {
          type: 'row',
          fields: [
            rule(
              'holdMinutes',
              'Hold (minutes)',
              'the hold',
              'How long a slot is held while the client pays.',
            ),
            rule(
              'rescheduleWindowHours',
              'Free reschedule (hours before)',
              'the reschedule window',
              'A client may reschedule free of charge up to this many hours before the start.',
            ),
          ],
        },
        {
          name: 'refunds',
          type: 'array',
          label: 'Cancellation and refund rule',
          labels: { singular: 'Step', plural: 'Steps' },
          admin: {
            description:
              'Each step: a cancellation at least so many hours before the start is refunded this share of what was paid. Empty until IIIC sets the rule (D-16, I-07).',
          },
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'hoursBefore',
                  type: 'number',
                  label: 'At least (hours before)',
                  required: true,
                  min: 0,
                  validate: wholeNumber('the hours'),
                  admin: { step: 1, width: '50%' },
                },
                {
                  name: 'refundPercent',
                  type: 'number',
                  label: 'Refund (%)',
                  required: true,
                  min: 0,
                  max: 100,
                  validate: wholeNumber('the share'),
                  admin: { step: 1, width: '50%' },
                },
              ],
            },
          ],
        },
      ],
    },
    factsField,
    {
      name: 'active',
      type: 'checkbox',
      label: 'Offered now',
      defaultValue: false,
      index: true,
      admin: {
        position: 'sidebar',
        description:
          'Tick it when the service is ready to be offered. A service is retired by unticking it, never deleted: bookings point at it.',
      },
    },
  ],
}
