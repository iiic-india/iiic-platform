import type { CollectionConfig } from 'payload'

import { allow, allowField, FIELD_POLICY, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { wholeNumber } from '@/fields/numbers'
import { BOOKING_FORMATS } from '@/lib/booking/states'
import { IST_FIELD } from '@/lib/time/ist'

const joinLink = {
  read: allowField(FIELD_POLICY.eventJoinLink.read),
  create: allowField(FIELD_POLICY.eventJoinLink.write),
  update: allowField(FIELD_POLICY.eventJoinLink.write),
}

/**
 * A session at a fixed time that people book a place on (docs/04 `events`; docs/03 F3, `info`:
 * "fixed session times"): the course info sessions in Release 1 (I-13), cohort sessions and
 * workshops later. Anyone reads an active session's title, time, format and capacity, as the
 * booking flow lists them; the join link goes only to the people booked on it.
 */
export const Events: CollectionConfig = {
  slug: 'events',
  labels: { singular: 'Fixed-time session', plural: 'Fixed-time sessions' },
  admin: {
    group: 'Calendar',
    useAsTitle: 'title',
    defaultColumns: ['title', 'startsAt', 'format', 'capacity', 'active'],
  },
  access: {
    read: allow(POLICY.events.read),
    create: allow(POLICY.events.create),
    update: allow(POLICY.events.update),
    delete: allow(POLICY.events.delete),
  },
  // Visitors read active sessions without signing in, so the staff two-factor wrapper stays off
  // this one operation; the read rule asks for the code itself before it shows an inactive one,
  // and so does the join link's field rule.
  custom: { totp: { disableAccessWrapper: { read: true } } },
  defaultSort: 'startsAt',
  fields: [
    { name: 'title', type: 'text', required: true, maxLength: 120 },
    {
      type: 'row',
      fields: [
        {
          name: 'kind',
          type: 'select',
          required: true,
          defaultValue: 'infoSession',
          options: [
            { label: 'Course info session', value: 'infoSession' },
            { label: 'Cohort session (Release 2)', value: 'cohortSession' },
            { label: 'Workshop', value: 'workshop' },
          ],
        },
        {
          name: 'service',
          type: 'relationship',
          relationTo: 'services',
          admin: { description: 'The service it is booked as, such as the info session.' },
        },
        {
          name: 'practitioner',
          type: 'relationship',
          relationTo: 'practitioners',
          admin: { description: 'Who runs it, if one person does.' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'startsAt',
          type: 'date',
          label: 'Starts',
          required: true,
          index: true,
          timezone: IST_FIELD,
          admin: { date: { pickerAppearance: 'dayAndTime' } },
        },
        {
          name: 'endsAt',
          type: 'date',
          label: 'Ends',
          required: true,
          timezone: IST_FIELD,
          admin: { date: { pickerAppearance: 'dayAndTime' } },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'format', type: 'select', required: true, options: [...BOOKING_FORMATS] },
        {
          name: 'capacity',
          type: 'number',
          min: 1,
          validate: wholeNumber('the capacity'),
          admin: { step: 1, description: 'Places, if limited.' },
        },
      ],
    },
    {
      name: 'joinLink',
      type: 'text',
      label: 'Join link or room',
      maxLength: 300,
      access: joinLink,
      admin: { description: 'Sent to the people booked on it, never shown on the site.' },
    },
    {
      name: 'active',
      type: 'checkbox',
      label: 'Open for booking',
      defaultValue: false,
      index: true,
      admin: { position: 'sidebar' },
    },
  ],
}
