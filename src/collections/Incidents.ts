import type { CollectionConfig, Field, FieldAccess } from 'payload'

import { allow, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { raiseIncidentOpened } from '@/lib/automations/privacy/hooks'
import { INCIDENT_STATUSES } from '@/lib/privacy/breaches'
import { IST_FIELD } from '@/lib/time/ist'

/** The deadlines, set by the privacy module from the time of detection. */
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

const due = (name: string, label: string): Field =>
  when(name, label, {
    access: serverWritten,
    admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
  })

/**
 * The breach register (docs/04 `incidents`; docs/05, Privacy; docs/08 §3; docs/18 §5): each
 * incident with when it was detected, what it touched, and each notification with its time: CERT-In
 * within 6 hours for a listed incident, the people affected without delay, the Data Protection
 * Board's detailed report within 72 hours (src/lib/privacy/breaches.ts). The description names
 * systems and kinds of data, never a person's details. Never deleted.
 */
export const Incidents: CollectionConfig = {
  slug: 'incidents',
  labels: { singular: 'Incident', plural: 'Breach register' },
  admin: {
    group: 'Privacy',
    useAsTitle: 'title',
    defaultColumns: ['title', 'detectedAt', 'status', 'certInDueAt', 'boardDueAt'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.incidents.read.roles),
  },
  access: {
    read: allow(POLICY.incidents.read),
    create: allow(POLICY.incidents.create),
    update: allow(POLICY.incidents.update),
    delete: allow(POLICY.incidents.delete),
  },
  // An incident recorded raises O8's timers (M6, docs/19 §5); the clocks are set by
  // src/plugins/notesAndPrivacy.ts.
  hooks: { afterChange: [raiseIncidentOpened] },
  defaultSort: '-detectedAt',
  disableBulkEdit: true,
  fields: [
    { name: 'title', type: 'text', required: true, maxLength: 160 },
    {
      type: 'row',
      fields: [
        when('detectedAt', 'Detected', { required: true, index: true }),
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'open',
          index: true,
          options: [...INCIDENT_STATUSES],
        },
        when('containedAt', 'Contained'),
      ],
    },
    {
      name: 'description',
      type: 'textarea',
      required: true,
      maxLength: 4000,
      admin: { description: 'What happened. Name systems and kinds of data, never a person.' },
    },
    { name: 'systems', type: 'text', label: 'Systems involved', maxLength: 500 },
    {
      name: 'personalData',
      type: 'group',
      label: 'Personal data',
      fields: [
        { name: 'affected', type: 'checkbox', label: 'Personal data was affected' },
        { name: 'kinds', type: 'text', label: 'Kinds of data', maxLength: 500 },
        { name: 'peopleAffected', type: 'number', label: 'People affected', min: 0 },
      ],
    },
    {
      name: 'certIn',
      type: 'group',
      label: 'CERT-In',
      fields: [
        {
          name: 'reportable',
          type: 'checkbox',
          label: 'A listed incident: report to CERT-In',
        },
        {
          type: 'row',
          fields: [
            due('dueAt', 'Report by'),
            when('reportedAt', 'Reported'),
            { name: 'reference', type: 'text', maxLength: 200 },
          ],
        },
      ],
    },
    {
      name: 'people',
      type: 'group',
      label: 'People told',
      fields: [
        {
          type: 'row',
          fields: [
            when('notifiedAt', 'Told'),
            { name: 'how', type: 'text', label: 'How', maxLength: 200 },
            { name: 'count', type: 'number', label: 'How many', min: 0 },
          ],
        },
      ],
    },
    {
      name: 'board',
      type: 'group',
      label: 'Data Protection Board',
      fields: [
        {
          type: 'row',
          fields: [
            due('dueAt', 'Detailed report by'),
            when('notifiedAt', 'First notice'),
            when('detailedReportAt', 'Detailed report sent'),
          ],
        },
        { name: 'reference', type: 'text', maxLength: 200 },
      ],
    },
    { name: 'remediation', type: 'textarea', maxLength: 4000 },
    when('closedAt', 'Closed'),
  ],
}
