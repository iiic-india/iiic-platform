import type { CollectionConfig, Field } from 'payload'

import { allow, allowField, FIELD_POLICY, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { AGE_BANDS } from '@/collections/People'
import { istDayField } from '@/fields/istDay'
import { basisPointsField, paiseField, wholeNumber } from '@/fields/numbers'
import {
  BOOKING_FOR,
  BOOKING_FORMATS,
  BOOKING_PAYMENT_STATUSES,
  BOOKING_STATUSES,
  BOOKING_TYPES,
} from '@/lib/booking/states'
import { IST_FIELD } from '@/lib/time/ist'

const money = {
  read: allowField(FIELD_POLICY.bookingMoney.read),
  create: allowField(FIELD_POLICY.bookingMoney.write),
  update: allowField(FIELD_POLICY.bookingMoney.write),
}

const serverOnly = {
  read: allowField(FIELD_POLICY.serverOnly.read),
  create: allowField(FIELD_POLICY.serverOnly.write),
  update: allowField(FIELD_POLICY.serverOnly.write),
}

const instant = (name: string, label: string, extra: Partial<Field> = {}): Field =>
  ({
    name,
    type: 'date',
    label,
    timezone: IST_FIELD,
    admin: { date: { pickerAppearance: 'dayAndTime' } },
    ...extra,
  }) as Field

/**
 * A booking (docs/04 `bookings`, S2; docs/03 F3, F4): a counselling session, a proposal call or a
 * course info session, from a time request or a hold to its end. The schema only: the slot engine,
 * holds, time requests, policies and the moves between states are the booking builder's
 * (src/lib/booking/, docs/16-booking-and-payments-design.md).
 *
 * The database keeps two active bookings off one practitioner's time: an exclusion constraint over
 * the practitioner and [startsAt, endsAt) for the states in SLOT_BLOCKING_STATUSES, created by a
 * migration of its own (src/migrations/*_bookings_no_overlap.ts; docs/16 §4).
 *
 * Counselling is private (CLAUDE.md #3): nothing here is said in a session. A time request's note
 * is the client's message about when they can come, read by the office only.
 */
export const Bookings: CollectionConfig = {
  slug: 'bookings',
  labels: { singular: 'Booking', plural: 'Bookings' },
  admin: {
    group: 'Bookings',
    useAsTitle: 'reference',
    defaultColumns: ['reference', 'type', 'status', 'startsAt', 'practitioner', 'paymentStatus'],
    listSearchableFields: ['reference'],
    hidden: ({ user }) => !hasRole(user, 'owner', 'operator', 'practitioner'),
  },
  // src/access/policy.ts (docs/05): the office and owners; a practitioner their own.
  access: {
    read: allow(POLICY.bookings.read),
    create: allow(POLICY.bookings.create),
    update: allow(POLICY.bookings.update),
    delete: allow(POLICY.bookings.delete),
  },
  defaultSort: '-startsAt',
  disableBulkEdit: true,
  indexes: [{ fields: ['practitioner', 'startsAt'] }, { fields: ['status', 'holdExpiresAt'] }],
  fields: [
    {
      // Human-readable, unique, never enough on its own to read a booking (docs/16 §2).
      name: 'reference',
      type: 'text',
      required: true,
      unique: true,
      maxLength: 20,
      access: { create: serverOnly.create, update: serverOnly.update },
      admin: { readOnly: true, position: 'sidebar', description: 'Such as IIIC-S-24117.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'type',
          type: 'select',
          label: 'Kind',
          required: true,
          index: true,
          options: [...BOOKING_TYPES],
          admin: { width: '33%' },
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          index: true,
          options: [...BOOKING_STATUSES],
          admin: { width: '33%' },
        },
        {
          name: 'paymentStatus',
          type: 'select',
          label: 'Payment',
          required: true,
          defaultValue: 'notRequired',
          options: [...BOOKING_PAYMENT_STATUSES],
          admin: { width: '33%' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'service', type: 'relationship', relationTo: 'services', required: true },
        {
          // The id of the service's option chosen (Payload's id of the options row), with its
          // label and length copied in, so a later change to the service never changes a booking.
          name: 'serviceOption',
          type: 'text',
          label: 'Option',
          maxLength: 64,
          admin: { readOnly: true },
        },
        { name: 'optionLabel', type: 'text', label: 'Option as booked', maxLength: 100 },
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
        {
          name: 'practitioner',
          type: 'relationship',
          relationTo: 'practitioners',
          index: true,
          admin: { description: 'Whose time it takes. Empty for a fixed-time session.' },
        },
        {
          name: 'event',
          type: 'relationship',
          relationTo: 'events',
          index: true,
          admin: { description: 'The fixed-time session booked, for an info session.' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'person',
          type: 'relationship',
          relationTo: 'people',
          required: true,
          index: true,
          admin: { description: 'The client.' },
        },
        {
          name: 'bookedBy',
          type: 'relationship',
          relationTo: 'people',
          admin: { description: 'The parent or guardian who booked, when not the client.' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'whoFor', type: 'select', label: 'Who it is for', options: [...BOOKING_FOR] },
        { name: 'ageBand', type: 'select', label: 'Age band', options: [...AGE_BANDS] },
        { name: 'format', type: 'select', options: [...BOOKING_FORMATS] },
      ],
    },
    {
      type: 'row',
      fields: [
        instant('startsAt', 'Starts', { index: true }),
        instant('endsAt', 'Ends'),
        instant('holdExpiresAt', 'Hold ends', {
          access: { create: serverOnly.create, update: serverOnly.update },
          admin: {
            readOnly: true,
            date: { pickerAppearance: 'dayAndTime' },
            description: 'While held or waiting for payment.',
          },
        }),
      ],
    },
    {
      // docs/03 F3: "Request another time" (D-02). The office agrees a time and confirms it.
      name: 'timeRequest',
      type: 'group',
      label: 'Time request',
      admin: { condition: (data) => data?.status === 'requested' || Boolean(data?.timeRequest) },
      fields: [
        {
          name: 'preferredDays',
          type: 'array',
          label: 'Preferred days',
          maxRows: 14,
          fields: [istDayField('day', 'Day', { required: true })],
        },
        { name: 'preferredTimes', type: 'text', label: 'Preferred times', maxLength: 200 },
        { name: 'note', type: 'textarea', maxLength: 1000 },
      ],
    },
    {
      // The place or the Meet link (D-03, D-22), and the event in the practitioner's calendar.
      type: 'row',
      fields: [
        {
          name: 'meetingUrl',
          type: 'text',
          label: 'Meet link',
          maxLength: 300,
          access: { create: serverOnly.create, update: serverOnly.update },
        },
        {
          name: 'calendarEventId',
          type: 'text',
          label: 'Calendar event',
          maxLength: 200,
          access: serverOnly,
          admin: { readOnly: true },
        },
      ],
    },
    {
      // What the client pays, set by the server from the service and its price at booking
      // (CLAUDE.md #5); never shown anywhere while prices_public is off (D-21).
      name: 'price',
      type: 'group',
      access: money,
      admin: { description: 'Set by the platform at booking, in paise.' },
      fields: [
        {
          type: 'row',
          fields: [
            paiseField('totalPaise', 'Total (all-in)'),
            paiseField('taxPaise', 'Of which GST'),
            basisPointsField('gstRateBasisPoints', 'GST rate', '18% is 1800.'),
            { name: 'sacCode', type: 'text', label: 'SAC code', maxLength: 6 },
          ],
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'rescheduledFrom',
          type: 'relationship',
          relationTo: 'bookings',
          admin: { readOnly: true, description: 'The booking this one replaced.' },
        },
        instant('confirmedAt', 'Confirmed', {
          access: serverOnly,
          admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
        }),
      ],
    },
    {
      name: 'cancellation',
      type: 'group',
      admin: {
        condition: (data) =>
          data?.status === 'cancelledByClient' || data?.status === 'cancelledByIiic',
      },
      fields: [instant('at', 'Cancelled'), { name: 'reason', type: 'textarea', maxLength: 1000 }],
    },
    {
      // The call's company details (docs/03 F3, step 3 for a call), until organisations and
      // leads arrive (M4) and take them over.
      name: 'company',
      type: 'group',
      admin: { condition: (data) => data?.type === 'call' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'name', type: 'text', maxLength: 200 },
            { name: 'role', type: 'text', maxLength: 100 },
            { name: 'teamSize', type: 'text', label: 'Team size', maxLength: 50 },
            { name: 'sector', type: 'text', maxLength: 100 },
          ],
        },
      ],
    },
    {
      // The consents given in the flow (docs/08 §3), for the written receipt (B3a).
      name: 'consents',
      type: 'relationship',
      relationTo: 'consents',
      hasMany: true,
      admin: { readOnly: true },
    },
    {
      type: 'row',
      fields: [
        { name: 'source', type: 'text', maxLength: 100 },
        {
          name: 'utm',
          type: 'group',
          label: 'Campaign (UTM)',
          fields: [
            {
              type: 'row',
              fields: ['source', 'medium', 'campaign', 'term', 'content'].map((name) => ({
                name,
                type: 'text' as const,
                maxLength: 200,
              })),
            },
          ],
        },
      ],
    },
    {
      // The hash of the manage link's token (F4, `/b/[token]`): the token itself is sent once
      // and never stored. Hidden from every read.
      name: 'manageTokenHash',
      type: 'text',
      unique: true,
      hidden: true,
    },
    {
      // One checkout, one booking: a double submit finds the booking it already made.
      name: 'checkoutKey',
      type: 'text',
      unique: true,
      hidden: true,
    },
  ],
}
