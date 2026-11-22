import type { CollectionConfig } from 'payload'

import { allow, allowField, FIELD_POLICY, POLICY } from '@/access/policy'

/**
 * Practitioners' public profiles (docs/04 `practitioners`; docs/05, Content; I-09): the name
 * the site shows, a photograph, the credentials exactly as on their certificates, a short
 * biography and the services each offers. A visitor reads the public fields of an active
 * profile only: which staff account a profile belongs to is staff data, which an owner sets
 * (src/access/policy.ts). The calendar connection joins with the booking engine (M3, D-22).
 */
export const Practitioners: CollectionConfig = {
  slug: 'practitioners',
  labels: { singular: 'Practitioner', plural: 'Practitioners' },
  admin: {
    group: 'Content',
    useAsTitle: 'publicName',
    defaultColumns: ['publicName', 'services', 'active'],
  },
  // src/access/policy.ts (docs/05): anyone reads an active profile's public fields; owners,
  // operators and editors keep every profile; only owners delete one.
  access: {
    read: allow(POLICY.practitioners.read),
    create: allow(POLICY.practitioners.create),
    update: allow(POLICY.practitioners.update),
    delete: allow(POLICY.practitioners.delete),
  },
  // Visitors read active profiles without signing in, so the staff two-factor wrapper
  // (payload-totp) stays off this one operation; the read rule asks for the code itself before
  // it shows an inactive profile, and so does the staff account's field rule. Every write still
  // needs a verified code.
  custom: { totp: { disableAccessWrapper: { read: true } } },
  defaultSort: 'publicName',
  fields: [
    {
      name: 'publicName',
      type: 'text',
      label: 'Public name',
      required: true,
      admin: { description: 'The name the site shows, as the person wants it shown (I-09).' },
    },
    {
      name: 'photo',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'A photograph the person has agreed to publish (I-09, I-18).' },
    },
    {
      name: 'credentials',
      type: 'array',
      labels: { singular: 'Credential', plural: 'Credentials' },
      admin: {
        description:
          'Each exactly as it appears on the certificate, one to a row (I-09). Never a title the certificate does not give: no "Dr." without a doctorate, and no clinical title without its registration (CLAUDE.md #9).',
      },
      fields: [{ name: 'credential', type: 'text', required: true }],
    },
    {
      name: 'bio',
      type: 'textarea',
      label: 'Biography',
      admin: {
        description:
          'The person’s real background, as they supplied it. Counselling is described as non-clinical conversation (src/brand/VOICE.md).',
      },
    },
    {
      name: 'services',
      type: 'relationship',
      relationTo: 'services',
      hasMany: true,
      label: 'Services offered',
    },
    {
      // S2: the staff account behind the profile, for the calendar and the bookings (M3). An
      // owner links it, as owners manage staff accounts (docs/05); a visitor never reads it.
      name: 'staff',
      type: 'relationship',
      relationTo: 'users',
      label: 'Staff account',
      unique: true,
      filterOptions: { roles: { in: ['practitioner'] } },
      access: {
        read: allowField(FIELD_POLICY.practitionerStaff.read),
        create: allowField(FIELD_POLICY.practitionerStaff.write),
        update: allowField(FIELD_POLICY.practitionerStaff.write),
      },
      admin: {
        position: 'sidebar',
        description:
          'The practitioner’s own staff account, which an owner links. Never shown on the site.',
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: {
        position: 'sidebar',
        description:
          'Shown on the site while ticked. Tick it once the profile is complete and its credentials are checked against the certificates (I-09).',
      },
    },
  ],
}
