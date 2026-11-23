import type { CollectionConfig, Field, FieldAccess } from 'payload'

import { allow, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { istDayField } from '@/fields/istDay'
import { CERTIFICATE_ID_PATTERN, CERTIFICATE_STATUSES } from '@/lib/certificates/ids'
import { IST_FIELD } from '@/lib/time/ist'

/** Fields only the certificates module writes (src/lib/certificates/, docs/18 §4). */
const serverWritten: { create: FieldAccess; update: FieldAccess } = {
  create: () => false,
  update: () => false,
}

const instant = (name: string, label: string): Field => ({
  name,
  type: 'date',
  label,
  timezone: IST_FIELD,
  access: serverWritten,
  admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
})

/**
 * A certificate of completion (docs/04 `certificates`, S2; D-39; docs/08 §7; docs/18 §4). Issued,
 * revoked and reissued by the certificates module only, each act in the audit log; the office
 * reads them. The printed ID is public on the certificate; the verify token is not stored at all,
 * only its SHA-256 (`verifyTokenHash`, never returned by a read), so the QR code's link exists only
 * on the PDF and in the email that carries it (C5). Never a degree or diploma: the wording is the
 * fixed statement (src/lib/certificates/statement.ts). Never deleted: a certificate is revoked,
 * and a reissue is a new certificate that names the one it replaces.
 */
export const Certificates: CollectionConfig = {
  slug: 'certificates',
  labels: { singular: 'Certificate', plural: 'Certificates' },
  admin: {
    group: 'Learning',
    useAsTitle: 'certificateId',
    defaultColumns: ['certificateId', 'nameAsPrinted', 'programmeName', 'completedOn', 'status'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.certificates.read.roles),
  },
  access: {
    read: allow(POLICY.certificates.read),
    create: allow(POLICY.certificates.create),
    update: allow(POLICY.certificates.update),
    delete: allow(POLICY.certificates.delete),
  },
  defaultSort: '-issuedAt',
  disableBulkEdit: true,
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'certificateId',
          type: 'text',
          label: 'Certificate ID',
          required: true,
          unique: true,
          maxLength: 24,
          access: serverWritten,
          validate: (value: unknown) =>
            (typeof value === 'string' && CERTIFICATE_ID_PATTERN.test(value)) ||
            'A certificate ID reads IIIC-C-<year>-<number>-<check>.',
          admin: { readOnly: true },
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'valid',
          index: true,
          options: [...CERTIFICATE_STATUSES],
          access: serverWritten,
          admin: { readOnly: true },
        },
      ],
    },
    {
      name: 'person',
      type: 'relationship',
      relationTo: 'people',
      required: true,
      index: true,
      access: serverWritten,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'nameAsPrinted',
          type: 'text',
          label: 'Name as printed',
          required: true,
          maxLength: 120,
          access: serverWritten,
        },
        {
          // The programme line above the fixed statement ({{programme_name}}); from Release 2 an
          // enrolment's course names it (docs/04).
          name: 'programmeName',
          type: 'text',
          label: 'Programme',
          required: true,
          maxLength: 160,
          access: serverWritten,
        },
      ],
    },
    {
      // The programme's dates or format, as printed ({{programme_details}}).
      name: 'programmeDetails',
      type: 'text',
      label: 'Programme details',
      maxLength: 200,
      access: serverWritten,
    },
    { ...istDayField('completedOn', 'Completed on', { required: true }), access: serverWritten },
    {
      type: 'row',
      fields: [
        instant('issuedAt', 'Issued'),
        {
          name: 'issuedBy',
          type: 'relationship',
          relationTo: 'users',
          access: serverWritten,
          admin: { readOnly: true },
        },
        {
          // One bulk issue's certificates share it, so the audit log and the list can group them.
          name: 'batch',
          type: 'text',
          maxLength: 36,
          index: true,
          access: serverWritten,
          admin: { readOnly: true },
        },
      ],
    },
    {
      // SHA-256 of the 128-bit token the QR code carries (docs/04: unique, never shown).
      name: 'verifyTokenHash',
      type: 'text',
      required: true,
      unique: true,
      maxLength: 64,
      hidden: true,
      access: serverWritten,
    },
    {
      // Where the PDF is kept in the private bucket, and its SHA-256, which the verify page does
      // not show; the office downloads it through the certificates module, which audits it.
      type: 'row',
      fields: [
        {
          name: 'pdfKey',
          type: 'text',
          maxLength: 200,
          access: serverWritten,
          admin: { readOnly: true },
        },
        {
          name: 'pdfSha256',
          type: 'text',
          maxLength: 64,
          access: serverWritten,
          admin: { readOnly: true },
        },
      ],
    },
    {
      name: 'revocation',
      type: 'group',
      admin: { condition: (data) => data?.status === 'revoked' },
      fields: [
        instant('at', 'Revoked'),
        {
          name: 'by',
          type: 'relationship',
          relationTo: 'users',
          access: serverWritten,
          admin: { readOnly: true },
        },
        {
          // For staff only: the verify page says "revoked" and the day, never why.
          name: 'reason',
          type: 'textarea',
          maxLength: 1000,
          access: serverWritten,
          admin: { readOnly: true },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          // A reissue names the certificate it replaces, which is revoked in the same transaction.
          name: 'replaces',
          type: 'relationship',
          relationTo: 'certificates',
          unique: true,
          access: serverWritten,
          admin: { readOnly: true },
        },
      ],
    },
  ],
}
