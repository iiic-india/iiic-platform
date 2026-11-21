import {
  APIError,
  ValidationError,
  type CollectionBeforeChangeHook,
  type CollectionBeforeDeleteHook,
  type CollectionBeforeValidateHook,
  type CollectionConfig,
  type Field,
  type FilterOptions,
  type RelationshipFieldSingleValidation,
  type TextFieldSingleValidation,
} from 'payload'
import { relationship, text } from 'payload/shared'

import { allow, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import {
  idOf,
  inForceAt,
  isBefore,
  isFuture,
  isWithdrawal,
  LEDGER_MESSAGES as MESSAGES,
  needsEvidence,
} from '@/lib/privacy/consentLedger'
import { RECORD_DELETED } from '@/lib/privacy/consents'
import { CONSENT_CHANNELS, CONSENT_PURPOSES } from '@/lib/privacy/purposes'
import { LANGUAGES } from '@/lib/site/languages'
import { IST_FIELD } from '@/lib/time/ist'

type Data = Record<string, unknown>

/** A field error, as the admin shows it beside the field. */
function refuse(path: string, message: string): never {
  throw new ValidationError({ collection: 'consents', errors: [{ path, message }] })
}

/**
 * Fills in what an entry takes from elsewhere, and checks the rest, before anything is saved:
 * - a withdrawal names the consent it ends; it copies that consent's person, purpose, notice,
 *   language and time, and records when it was withdrawn (now, unless staff give the time a
 *   reply arrived);
 * - a consent names the notice the person saw; it takes the purpose and the language from that
 *   notice, which must have been in force when the consent was given (now, unless staff give
 *   the time of a reply).
 */
export const completeEntry: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
  if (operation !== 'create' || !data) return data
  const now = new Date()
  if (data.channel === 'recordDeleted' && req.context?.[RECORD_DELETED] !== true) {
    refuse('channel', MESSAGES.deletedOnly)
  }

  const withdrawn = idOf(data.withdraws)
  if (withdrawn !== null) {
    const grant = await req.payload.findByID({
      collection: 'consents',
      id: withdrawn,
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
      req,
    })
    if (!grant) return refuse('withdraws', MESSAGES.noGrant)
    if (isWithdrawal(grant)) refuse('withdraws', MESSAGES.notAGrant)
    const { totalDocs } = await req.payload.count({
      collection: 'consents',
      where: { withdraws: { equals: grant.id } },
      overrideAccess: true,
      req,
    })
    if (totalDocs > 0) refuse('withdraws', MESSAGES.alreadyWithdrawn)
    const withdrawnAt = data.withdrawnAt ?? now.toISOString()
    if (isFuture(withdrawnAt, now)) refuse('withdrawnAt', MESSAGES.future)
    if (isBefore(withdrawnAt, grant.grantedAt)) refuse('withdrawnAt', MESSAGES.beforeGrant)
    return {
      ...data,
      person: idOf(grant.person),
      purpose: grant.purpose,
      noticeVersion: idOf(grant.noticeVersion),
      language: grant.language,
      grantedAt: grant.grantedAt,
      withdrawnAt,
    }
  }

  if (data.withdrawnAt) refuse('withdrawnAt', MESSAGES.givenWithdrawn)
  if (data.channel === 'recordDeleted') refuse('channel', MESSAGES.deletedOnly)
  const versionId = idOf(data.noticeVersion)
  // Without a notice, the field's own check says what is missing.
  if (versionId === null) return data
  const version = await req.payload.findByID({
    collection: 'consent-versions',
    id: versionId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  if (!version) return refuse('noticeVersion', MESSAGES.notice)
  const grantedAt = data.grantedAt ?? now.toISOString()
  if (isFuture(grantedAt, now)) refuse('grantedAt', MESSAGES.future)
  if (!inForceAt(version.effectiveFrom, grantedAt)) refuse('noticeVersion', MESSAGES.notInForce)
  if (data.purpose && data.purpose !== version.purpose) refuse('purpose', MESSAGES.otherPurpose)
  return { ...data, purpose: version.purpose, language: version.language, grantedAt }
}

/** Append-only (docs/04): nothing changes an entry, even with access overridden. */
export const neverChange: CollectionBeforeChangeHook = ({ data, operation }) => {
  if (operation === 'update') throw new APIError(MESSAGES.changed, 403)
  return data
}

/** Append-only (docs/04): nothing deletes an entry, even with access overridden. */
export const neverDelete: CollectionBeforeDeleteHook = () => {
  throw new APIError(MESSAGES.deleted, 403)
}

/** Whether the entry in the form is a consent rather than a withdrawal. */
const isGrant = (data: Data | undefined) => !isWithdrawal({ withdraws: data?.withdraws })

/** What the hook fills in passes the field's own check: the entry is complete before it is saved. */
const filledByTheLedger = () => true as const

/** Only the notices already in force can be chosen (the hook checks the time of the consent). */
const inForceNow: FilterOptions = () => ({
  effectiveFrom: { less_than_equal: new Date().toISOString() },
})

/** Every consent is recorded with its person; a withdrawal takes the person from the consent. */
const personOfAGrant: RelationshipFieldSingleValidation = (value, { data }) =>
  Boolean(value) || !isGrant(data as Data) || MESSAGES.person

/** A consent names the notice it was given under; a withdrawal takes it from the consent. */
const noticeOfAGrant: RelationshipFieldSingleValidation = async (value, options) =>
  isGrant(options.data as Data) ? relationship(value, options) : true

/** Payload's own text check, then: a consent recorded by staff says where its evidence is kept. */
const validateReference: TextFieldSingleValidation = async (value, options) => {
  const base = await text(value, options)
  if (base !== true) return base
  return (
    (typeof value === 'string' && value.trim() !== '') ||
    !needsEvidence(options.data as Data) ||
    MESSAGES.evidence
  )
}

const evidenceText = (name: string, label: string, description?: string): Field => ({
  name,
  type: 'text',
  label,
  maxLength: 500,
  admin: { description },
})

/**
 * The consent ledger (docs/04 `consents`, S2; docs/08 §3): what each person agreed to, under
 * which notice, when and how, with the evidence; and each withdrawal, as an entry of its own
 * that names the consent it ends. Append-only: entries are created, never changed or deleted
 * (src/lib/privacy/consentLedger.ts). The operator reads the log and records replies; forms
 * record theirs on the server. Kept out of every public surface: nobody reads it without a
 * staff role (src/access/policy.ts).
 */
export const Consents: CollectionConfig = {
  slug: 'consents',
  labels: { singular: 'Consent', plural: 'Consent log' },
  admin: {
    group: 'Privacy',
    defaultColumns: ['person', 'purpose', 'grantedAt', 'withdrawnAt', 'channel'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.consents.read.roles),
    description:
      'Every consent, and every withdrawal as an entry of its own. Entries are never changed or deleted.',
  },
  access: {
    read: allow(POLICY.consents.read),
    create: allow(POLICY.consents.create),
    update: allow(POLICY.consents.update),
    delete: allow(POLICY.consents.delete),
  },
  defaultSort: '-createdAt',
  disableBulkEdit: true,
  hooks: {
    beforeValidate: [completeEntry],
    beforeChange: [neverChange],
    beforeDelete: [neverDelete],
  },
  fields: [
    {
      name: 'withdraws',
      type: 'relationship',
      relationTo: 'consents',
      label: 'Withdraws',
      // One withdrawal per consent, held by the database too.
      unique: true,
      index: true,
      filterOptions: { withdraws: { exists: false } },
      admin: {
        description:
          'To record a withdrawal, choose the consent it ends. Leave empty to record a consent.',
      },
    },
    {
      // Not required in the database: deleting a person (an erasure) leaves their entries
      // without a person, while every consent is recorded with one.
      name: 'person',
      type: 'relationship',
      relationTo: 'people',
      index: true,
      validate: personOfAGrant,
      admin: { description: 'For a withdrawal, taken from the consent it ends.' },
    },
    {
      // Required in the database too: every entry names the notice its consent was given under.
      name: 'noticeVersion',
      type: 'relationship',
      relationTo: 'consent-versions',
      label: 'Notice',
      required: true,
      filterOptions: inForceNow,
      validate: noticeOfAGrant,
      admin: {
        description:
          'The consent text the person saw, in the version they saw. For a withdrawal, taken from the consent it ends.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'purpose',
          type: 'select',
          options: [...CONSENT_PURPOSES],
          required: true,
          index: true,
          validate: filledByTheLedger,
          admin: { readOnly: true, description: 'Taken from the notice.' },
        },
        {
          name: 'language',
          type: 'select',
          options: [...LANGUAGES],
          required: true,
          validate: filledByTheLedger,
          admin: { readOnly: true, description: 'Taken from the notice.' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'grantedAt',
          type: 'date',
          label: 'Given',
          required: true,
          index: true,
          timezone: IST_FIELD,
          validate: filledByTheLedger,
          admin: {
            date: { pickerAppearance: 'dayAndTime' },
            description:
              'When the person gave it: leave empty for now. For a withdrawal, taken from the consent it ends.',
          },
        },
        {
          name: 'withdrawnAt',
          type: 'date',
          label: 'Withdrawn',
          timezone: IST_FIELD,
          admin: {
            date: { pickerAppearance: 'dayAndTime' },
            description: 'Only on a withdrawal: when the person withdrew. Leave empty for now.',
          },
        },
      ],
    },
    {
      name: 'channel',
      type: 'select',
      options: [...CONSENT_CHANNELS],
      required: true,
      admin: { description: 'How it reached IIIC.' },
    },
    {
      name: 'evidence',
      type: 'group',
      admin: {
        description: 'What shows it was the person: recorded by the server for a form on the site.',
      },
      fields: [
        evidenceText('form', 'Form or message', 'Which form, or which message they replied to.'),
        {
          name: 'reference',
          type: 'text',
          label: 'Where the evidence is kept',
          maxLength: 500,
          validate: validateReference,
          admin: {
            description:
              'For a consent by email, WhatsApp, phone or paper: the file name of the saved copy.',
          },
        },
        {
          type: 'row',
          fields: [evidenceText('ip', 'IP address'), evidenceText('userAgent', 'Browser')],
        },
      ],
    },
    {
      name: 'writtenReceipt',
      type: 'text',
      label: 'Written receipt',
      maxLength: 500,
      admin: {
        description:
          'For a counselling booking or the Map: the message id of the email that confirmed the consent in writing.',
      },
    },
    {
      name: 'withdrawal',
      type: 'join',
      collection: 'consents',
      on: 'withdraws',
      admin: {
        allowCreate: false,
        defaultColumns: ['withdrawnAt', 'channel'],
        description: 'The entry that withdrew this consent, if it has been withdrawn.',
      },
    },
  ],
}
