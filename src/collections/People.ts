import {
  ValidationError,
  type CollectionBeforeChangeHook,
  type CollectionBeforeDeleteHook,
  type CollectionConfig,
} from 'payload'

import { allow, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { phoneField } from '@/lib/phone'
import { withdrawOnDeletion } from '@/lib/privacy/consents'
import { DEFAULT_LANGUAGE, LANGUAGES } from '@/lib/site/languages'
import { IST_FIELD } from '@/lib/time/ist'

/**
 * The age bands a record holds: the one line the law draws (docs/08 §3: under 18, a parent or
 * guardian books and consents; no analytics events and no marketing). Nothing finer is asked
 * until a report needs it.
 */
export const AGE_BANDS = [
  { value: 'under18', label: 'Under 18' },
  { value: 'adult', label: '18 or over' },
] as const

/** The channels IIIC messages people on in Release 1: SMS waits for DLT registration (D-08). */
export const PREFERRED_CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
] as const

/** The two details that identify a person once they are verified (docs/04: unique when verified). */
const VERIFIED = [
  { field: 'mobile', verifiedAt: 'mobileVerifiedAt', name: 'mobile number' },
  { field: 'email', verifiedAt: 'emailVerifiedAt', name: 'email address' },
] as const

/**
 * A verified mobile number or email belongs to one person: a second record cannot hold the same
 * one verified (docs/04). Unverified, the same detail may sit on two records until staff merge
 * them (docs/05, People). Verification itself comes with one-time codes (R2), on the server.
 */
export const oneVerifiedPerson: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const merged = { ...(originalDoc ?? {}), ...(data ?? {}) } as Record<string, unknown>
  const errors = []
  for (const { field, verifiedAt, name } of VERIFIED) {
    const value = merged[field]
    if (typeof value !== 'string' || value === '' || !merged[verifiedAt]) continue
    const { totalDocs } = await req.payload.count({
      collection: 'people',
      where: {
        and: [
          { [field]: { equals: value } },
          { [verifiedAt]: { exists: true } },
          ...(originalDoc?.id === undefined ? [] : [{ id: { not_equals: originalDoc.id } }]),
        ],
      },
      overrideAccess: true,
      req,
    })
    if (totalDocs > 0) {
      errors.push({
        path: field,
        message: `Another person’s record has this ${name}, verified. Open that record instead.`,
      })
    }
  }
  if (errors.length) throw new ValidationError({ collection: 'people', errors })
  return data
}

/** Deleting a person marks their consents withdrawn, in the same transaction (docs/04). */
export const withdrawConsentsOnDeletion: CollectionBeforeDeleteHook = async ({ id, req }) => {
  await withdrawOnDeletion(req, id)
}

const verifiedAt = (name: string, label: string) => ({
  name,
  type: 'date' as const,
  label,
  timezone: IST_FIELD,
  // Set by the server when the person proves the detail with a one-time code, never by hand.
  access: { create: () => false, update: () => false },
  admin: {
    readOnly: true,
    position: 'sidebar' as const,
    date: { pickerAppearance: 'dayAndTime' as const },
  },
})

/**
 * The one record of a person across the three applications (docs/04 `people`, S2; docs/05,
 * People): contact details, preferences and how they found IIIC. Their consents, bookings and
 * the rest point at this record. The link to an organisation comes with `organisations` (M4).
 * Every write is in the audit log (src/plugins/auditLog.ts).
 */
export const People: CollectionConfig = {
  slug: 'people',
  labels: { singular: 'Person', plural: 'People' },
  admin: {
    group: 'People',
    useAsTitle: 'fullName',
    defaultColumns: ['fullName', 'mobile', 'email', 'city', 'updatedAt'],
    listSearchableFields: ['fullName', 'mobile', 'email'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.people.read.roles),
  },
  // src/access/policy.ts (docs/04, docs/05): owners and the operator; only owners delete.
  access: {
    read: allow(POLICY.people.read),
    create: allow(POLICY.people.create),
    update: allow(POLICY.people.update),
    delete: allow(POLICY.people.delete),
  },
  hooks: {
    beforeChange: [oneVerifiedPerson],
    beforeDelete: [withdrawConsentsOnDeletion],
  },
  fields: [
    { name: 'fullName', type: 'text', label: 'Full name', required: true, maxLength: 200 },
    {
      type: 'row',
      fields: [
        phoneField('mobile', {
          label: 'Mobile number',
          index: true,
          description: 'Stored with its country code: +91 for India.',
        }),
        {
          name: 'email',
          type: 'email',
          index: true,
          hooks: {
            beforeValidate: [
              ({ value }) =>
                typeof value === 'string' ? value.trim().toLowerCase() || null : value,
            ],
          },
        },
      ],
    },
    verifiedAt('mobileVerifiedAt', 'Mobile verified'),
    verifiedAt('emailVerifiedAt', 'Email verified'),
    {
      type: 'row',
      fields: [
        {
          name: 'preferredChannel',
          type: 'select',
          label: 'Preferred channel',
          options: [...PREFERRED_CHANNELS],
        },
        {
          name: 'language',
          type: 'select',
          options: [...LANGUAGES],
          defaultValue: DEFAULT_LANGUAGE,
          required: true,
        },
        {
          name: 'ageBand',
          type: 'select',
          label: 'Age band',
          options: [...AGE_BANDS],
          admin: {
            description: 'Under 18: a parent or guardian books and consents for them.',
          },
        },
      ],
    },
    { name: 'city', type: 'text', maxLength: 100 },
    {
      name: 'source',
      type: 'text',
      maxLength: 100,
      admin: { description: 'How the person first reached IIIC, such as a booking or a referral.' },
    },
    {
      name: 'utm',
      type: 'group',
      label: 'Campaign (UTM)',
      admin: { description: 'The campaign tags on the link the person first arrived by, if any.' },
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
    {
      name: 'tags',
      type: 'text',
      hasMany: true,
      maxLength: 50,
      admin: { description: 'Short labels for the office’s own use.' },
    },
    {
      // The ledger, read-only here: consents are recorded and withdrawn under Privacy.
      name: 'consents',
      type: 'join',
      collection: 'consents',
      on: 'person',
      defaultSort: '-grantedAt',
      admin: {
        allowCreate: false,
        defaultColumns: ['purpose', 'grantedAt', 'withdrawnAt', 'channel'],
        description: 'What the person has agreed to, and any withdrawal, newest first.',
      },
    },
  ],
}
