import {
  ValidationError,
  type CollectionBeforeChangeHook,
  type CollectionBeforeDeleteHook,
  type CollectionConfig,
} from 'payload'

import { allow, allowField, FIELD_POLICY, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { phoneField } from '@/lib/phone'
import { eraseFromPipeline } from '@/lib/pipeline/core/hooks'
import { withdrawOnDeletion } from '@/lib/privacy/consents'
import { deleteReviewsOnDeletion } from '@/lib/proof/ledger'
import { DEFAULT_LANGUAGE, LANGUAGES } from '@/lib/site/languages'
import { IST_FIELD } from '@/lib/time/ist'

/**
 * The age bands a record holds: the one line the law draws (docs/08 §3: under 18, a parent or
 * guardian books and consents; no marketing, and no analytics events once the age band says under 18). Nothing finer is asked
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

/**
 * Every field but the name, mobile and email: the office's alone to read. A practitioner reads
 * their own clients (POLICY.people) and only those three (FIELD_POLICY.personRecord).
 */
const OFFICE_ONLY = { read: allowField(FIELD_POLICY.personRecord.read) }

const verifiedAt = (name: string, label: string) => ({
  name,
  type: 'date' as const,
  label,
  timezone: IST_FIELD,
  // Set by the server when the person proves the detail with a one-time code, never by hand.
  access: { ...OFFICE_ONLY, create: () => false, update: () => false },
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
    hidden: ({ user }) => !hasRole(user, ...POLICY.people.read.roles, 'practitioner'),
  },
  // src/access/policy.ts (docs/04, docs/05): owners and the operator; a practitioner reads their
  // own clients' name, mobile and email; only owners delete.
  access: {
    read: allow(POLICY.people.read),
    create: allow(POLICY.people.create),
    update: allow(POLICY.people.update),
    delete: allow(POLICY.people.delete),
  },
  hooks: {
    beforeChange: [oneVerifiedPerson],
    // First the consents, whose withdrawal takes the person's reviews down; then the reviews
    // themselves, which go with the person (docs/04); then their enquiries, and their leads'
    // link to them (docs/17 §9).
    beforeDelete: [withdrawConsentsOnDeletion, deleteReviewsOnDeletion, eraseFromPipeline],
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
          access: OFFICE_ONLY,
        },
        {
          name: 'language',
          type: 'select',
          access: OFFICE_ONLY,
          options: [...LANGUAGES],
          defaultValue: DEFAULT_LANGUAGE,
          required: true,
        },
        {
          name: 'ageBand',
          type: 'select',
          label: 'Age band',
          access: OFFICE_ONLY,
          options: [...AGE_BANDS],
          admin: {
            description: 'Under 18: a parent or guardian books and consents for them.',
          },
        },
      ],
    },
    { name: 'city', type: 'text', maxLength: 100, access: OFFICE_ONLY },
    {
      // Where the person works, for a lead (docs/04 `organisation_id?`; M4, docs/17 §2). A public
      // form sets these only on a person it creates; it never changes an existing record. The
      // office's alone: a practitioner reads only a client's name, mobile and email (D-89).
      type: 'row',
      fields: [
        {
          name: 'organisation',
          type: 'relationship',
          relationTo: 'organisations',
          index: true,
          access: OFFICE_ONLY,
        },
        {
          name: 'jobTitle',
          type: 'text',
          label: 'Role there',
          maxLength: 100,
          access: OFFICE_ONLY,
        },
      ],
    },
    {
      name: 'source',
      type: 'text',
      maxLength: 100,
      access: OFFICE_ONLY,
      admin: { description: 'How the person first reached IIIC, such as a booking or a referral.' },
    },
    {
      name: 'utm',
      type: 'group',
      label: 'Campaign (UTM)',
      access: OFFICE_ONLY,
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
      access: OFFICE_ONLY,
      admin: { description: 'Short labels for the office’s own use.' },
    },
    {
      // The ledger, read-only here: consents are recorded and withdrawn under Privacy.
      name: 'consents',
      type: 'join',
      collection: 'consents',
      on: 'person',
      defaultSort: '-grantedAt',
      access: OFFICE_ONLY,
      admin: {
        allowCreate: false,
        defaultColumns: ['purpose', 'grantedAt', 'withdrawnAt', 'channel'],
        description: 'What the person has agreed to, and any withdrawal, newest first.',
      },
    },
    {
      // The bookings that name the person as the client. A practitioner reaches their own
      // clients through it (POLICY.people), but never reads it: the office's alone.
      name: 'bookings',
      type: 'join',
      collection: 'bookings',
      on: 'person',
      defaultSort: '-startsAt',
      access: OFFICE_ONLY,
      admin: {
        allowCreate: false,
        defaultColumns: ['reference', 'status', 'startsAt', 'practitioner'],
        description: 'The bookings this person is the client on, latest first.',
      },
    },
    // ---- Messaging (M6, docs/19 §4) ----
    {
      // Addresses of theirs that bounced, complained or asked to stop (docs/06 O9).
      name: 'suppressions',
      type: 'join',
      collection: 'suppressions',
      on: 'person',
      defaultSort: '-at',
      access: OFFICE_ONLY,
      admin: {
        allowCreate: false,
        defaultColumns: ['address', 'channel', 'reason', 'at'],
        description: 'Nothing is sent to these addresses. Ask the person for one that works.',
      },
    },
    {
      // When the person last wrote to IIIC on WhatsApp: the 24-hour window for replies that are
      // not templates (docs/06 V1; docs/13 §7). Written by the WhatsApp webhook only.
      name: 'whatsappLastInboundAt',
      type: 'date',
      label: 'Last WhatsApp message from them',
      access: { ...OFFICE_ONLY, create: () => false, update: () => false },
      timezone: IST_FIELD,
      admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
}
