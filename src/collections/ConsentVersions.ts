import {
  APIError,
  type CollectionBeforeChangeHook,
  type CollectionBeforeDeleteHook,
  type CollectionBeforeValidateHook,
  type CollectionConfig,
} from 'payload'

import { allow, allowWhere, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { inForceAt } from '@/lib/privacy/consentLedger'
import { CONSENT_PURPOSES, purposeLabel } from '@/lib/privacy/purposes'
import { DEFAULT_LANGUAGE, LANGUAGES, languageLabel } from '@/lib/site/languages'
import { IST_FIELD } from '@/lib/time/ist'

export const VERSION_MESSAGES = {
  changed: 'This text is in force, so it no longer changes. Add a new version instead.',
  deleted: 'This text is in force, so it is kept. Add a new version instead.',
} as const

/** Whether a version is in force: its time has come. From then on it never changes (docs/04). */
export function isInForce(doc: { effectiveFrom?: unknown } | null | undefined, now = new Date()) {
  return inForceAt(doc?.effectiveFrom, now)
}

/** The versions a change may reach: those not yet in force, at the time of the request. */
const notYetInForce = () => ({ effectiveFrom: { greater_than: new Date().toISOString() } })

/** A new version takes the next number for its purpose and language: 1, then 2, and so on. */
export const numberVersion: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
  if (operation !== 'create' || !data?.purpose) return data
  const language = data.language ?? DEFAULT_LANGUAGE
  const { docs } = await req.payload.find({
    collection: 'consent-versions',
    where: { and: [{ purpose: { equals: data.purpose } }, { language: { equals: language } }] },
    sort: '-version',
    limit: 1,
    depth: 0,
    select: { version: true },
    overrideAccess: true,
    req,
  })
  return { ...data, language, version: (docs[0]?.version ?? 0) + 1 }
}

/** A version in force is never changed, even with access overridden (docs/04, docs/12 §11). */
export const keepInForce: CollectionBeforeChangeHook = ({ data, operation, originalDoc }) => {
  if (operation === 'update' && isInForce(originalDoc)) {
    throw new APIError(VERSION_MESSAGES.changed, 403)
  }
  return data
}

/**
 * The name the admin lists a version by, and a consent's notice shows: purpose, number and
 * language, which are set when the version is created and never change.
 */
export const nameVersion: CollectionBeforeChangeHook = ({ data, operation, originalDoc }) => {
  const fixed = operation === 'update' && originalDoc ? originalDoc : data
  return {
    ...data,
    title: `${purposeLabel(fixed.purpose)}, version ${fixed.version} (${languageLabel(fixed.language)})`,
  }
}

/** A version in force is kept, even with access overridden: consents name it. */
export const keepInForceOnDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const doc = await req.payload.findByID({
    collection: 'consent-versions',
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  if (isInForce(doc)) throw new APIError(VERSION_MESSAGES.deleted, 403)
}

/** Set once, when the version is created: a new purpose or language is a new version. */
const fixedOnceCreated = { update: () => false }

/**
 * The consent texts, one version at a time (docs/04 `consent_versions`; docs/12 §11): the words a
 * person sees beside each checkbox, per purpose and language. A version is written ahead of the
 * time it takes effect and never changes once in force, so the text a person consented to is
 * never lost when the wording changes; each consent names the version it was given under.
 */
export const ConsentVersions: CollectionConfig = {
  slug: 'consent-versions',
  labels: { singular: 'Consent text', plural: 'Consent texts' },
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'effectiveFrom', 'updatedAt'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.consentVersions.read.roles),
    description:
      'The words beside each consent checkbox, one version at a time. A version in force never changes: add a new one.',
  },
  access: {
    read: allow(POLICY.consentVersions.read),
    create: allow(POLICY.consentVersions.create),
    update: allowWhere(POLICY.consentVersions.update, notYetInForce),
    delete: allowWhere(POLICY.consentVersions.delete, notYetInForce),
  },
  defaultSort: '-effectiveFrom',
  disableBulkEdit: true,
  indexes: [{ fields: ['purpose', 'language', 'version'], unique: true }],
  hooks: {
    beforeValidate: [numberVersion],
    beforeChange: [keepInForce, nameVersion],
    beforeDelete: [keepInForceOnDelete],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      admin: { readOnly: true, position: 'sidebar', description: 'Named by the platform.' },
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
          access: fixedOnceCreated,
        },
        {
          name: 'language',
          type: 'select',
          options: [...LANGUAGES],
          defaultValue: DEFAULT_LANGUAGE,
          required: true,
          access: fixedOnceCreated,
        },
        {
          name: 'version',
          type: 'number',
          required: true,
          access: fixedOnceCreated,
          // Numbered by the hook above before the checks run.
          validate: () => true as const,
          admin: { readOnly: true, description: 'Numbered by the platform.' },
        },
      ],
    },
    {
      name: 'text',
      type: 'textarea',
      required: true,
      maxLength: 5000,
      admin: { description: 'The words exactly as the person sees them.' },
    },
    {
      name: 'effectiveFrom',
      type: 'date',
      label: 'In force from',
      required: true,
      index: true,
      timezone: IST_FIELD,
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        description:
          'From this time, forms show this version. After it, the text can no longer change.',
      },
    },
  ],
}
