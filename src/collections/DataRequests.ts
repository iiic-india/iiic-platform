import type { CollectionConfig, Field, FieldAccess } from 'payload'

import { allow, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { raiseRequestReceived } from '@/lib/automations/privacy/hooks'
import {
  REQUEST_CHANNELS,
  REQUEST_OUTCOMES,
  REQUEST_STATUSES,
  REQUEST_SUMMARY_MAX,
  REQUEST_TYPES,
  VERIFICATION_METHODS,
} from '@/lib/privacy/requests'
import { IST_FIELD } from '@/lib/time/ist'

/** Fields the privacy module writes (the clocks, the export), never typed by staff. */
const serverWritten: { create: FieldAccess; update: FieldAccess } = {
  create: () => false,
  update: () => false,
}

const when = (name: string, label: string, extra: Partial<Field> = {}): Field =>
  ({
    name,
    type: 'date',
    label,
    timezone: IST_FIELD,
    admin: { date: { pickerAppearance: 'dayAndTime' } },
    ...extra,
  }) as Field

/**
 * A privacy request or complaint (docs/04 `data_requests`; docs/05, Privacy; docs/08 §3, §4;
 * docs/18 §5): access, correction, erasure, withdrawal, nomination, a consumer complaint or a
 * privacy grievance, with its two clocks (src/lib/privacy/requests.ts), its identity check, its
 * assignee and how it ended. The operator prepares; an owner confirms an erasure. The moves
 * between states, the clocks and the erasure itself are the privacy module's (builder A); every
 * change is in the audit log. Never deleted.
 */
export const DataRequests: CollectionConfig = {
  slug: 'data-requests',
  labels: { singular: 'Privacy request', plural: 'Privacy requests' },
  admin: {
    group: 'Privacy',
    useAsTitle: 'type',
    defaultColumns: ['type', 'status', 'receivedAt', 'resolveBy', 'assignee'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.dataRequests.read.roles),
  },
  access: {
    read: allow(POLICY.dataRequests.read),
    create: allow(POLICY.dataRequests.create),
    update: allow(POLICY.dataRequests.update),
    delete: allow(POLICY.dataRequests.delete),
  },
  // A request recorded raises O4's or O7's event (M6, docs/19 §5); the clocks are set by
  // src/plugins/notesAndPrivacy.ts.
  hooks: { afterChange: [raiseRequestReceived] },
  defaultSort: 'resolveBy',
  disableBulkEdit: true,
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'type', type: 'select', required: true, index: true, options: [...REQUEST_TYPES] },
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'received',
          index: true,
          options: [...REQUEST_STATUSES],
        },
        { name: 'assignee', type: 'relationship', relationTo: 'users', index: true },
      ],
    },
    { name: 'person', type: 'relationship', relationTo: 'people', required: true, index: true },
    {
      type: 'row',
      fields: [
        { name: 'channel', type: 'select', required: true, options: [...REQUEST_CHANNELS] },
        when('receivedAt', 'Received', { required: true, index: true }),
      ],
    },
    {
      name: 'summary',
      type: 'textarea',
      label: 'What the person asks',
      required: true,
      maxLength: REQUEST_SUMMARY_MAX,
      admin: {
        description:
          'In the person’s words where possible. Nothing said in a counselling session belongs here.',
      },
    },
    {
      // The clocks, set by the privacy module from the type and the time received.
      type: 'row',
      fields: [
        when('acknowledgeBy', 'Acknowledge by', {
          index: true,
          access: serverWritten,
          admin: { readOnly: true },
        }),
        when('resolveBy', 'Resolve by', {
          index: true,
          access: serverWritten,
          admin: { readOnly: true },
        }),
      ],
    },
    {
      type: 'row',
      fields: [
        when('acknowledgedAt', 'Acknowledged'),
        when('complaintCopySentAt', 'Copy of the complaint sent', {
          admin: {
            description: 'Complaints only: the copy as recorded (from 1 January 2027).',
            date: { pickerAppearance: 'dayAndTime' },
          },
        }),
      ],
    },
    {
      type: 'row',
      fields: [
        when('verifiedAt', 'Identity verified'),
        { name: 'verificationMethod', type: 'select', options: [...VERIFICATION_METHODS] },
      ],
    },
    {
      // The access request's export, in the private bucket (docs/18 §5).
      name: 'exportKey',
      type: 'text',
      maxLength: 200,
      access: serverWritten,
      admin: { readOnly: true },
    },
    {
      name: 'resolution',
      type: 'group',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'outcome', type: 'select', options: [...REQUEST_OUTCOMES] },
            when('closedAt', 'Closed'),
          ],
        },
        {
          name: 'note',
          type: 'textarea',
          label: 'What was done, or why not',
          maxLength: 2000,
        },
        {
          type: 'row',
          fields: [
            when('erasureConfirmedAt', 'Erasure confirmed', {
              // Set only by the owner's "Confirm erasure", which runs the erasure itself
              // (VIEW_POLICY.privacyDecision; docs/18 §5): never typed.
              access: serverWritten,
              admin: {
                readOnly: true,
                description: 'An owner confirms an erasure after reading what it deletes.',
                date: { pickerAppearance: 'dayAndTime' },
              },
            }),
            {
              name: 'decidedBy',
              type: 'relationship',
              relationTo: 'users',
              access: serverWritten,
              admin: { readOnly: true },
            },
          ],
        },
      ],
    },
  ],
}
