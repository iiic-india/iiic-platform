import type { CollectionConfig, Field } from 'payload'

import { allow, allowField, FIELD_POLICY, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { istDayField } from '@/fields/istDay'
import { paiseField } from '@/fields/numbers'
import { prepareLead, recordLeadChange } from '@/lib/pipeline/core/hooks'
import { validateEndReason, validateStage } from '@/lib/pipeline/fields'
import { LEAD_KINDS, LEAD_STAGES } from '@/lib/pipeline/stages'
import { LEAD_SOURCES, UNTOUCHED_LEVELS } from '@/lib/pipeline/values'
import { IST_FIELD } from '@/lib/time/ist'

const serverOnly = {
  read: allowField(FIELD_POLICY.serverOnly.read),
  create: allowField(FIELD_POLICY.serverOnly.write),
  update: allowField(FIELD_POLICY.serverOnly.write),
}

const instant = (name: string, label: string, description?: string): Field => ({
  name,
  type: 'date',
  label,
  timezone: IST_FIELD,
  access: serverOnly,
  admin: {
    readOnly: true,
    date: { pickerAppearance: 'dayAndTime' },
    ...(description ? { description } : {}),
  },
})

/**
 * A lead (docs/04 `leads`, S1; docs/05 Pipeline; docs/17 §2–§3): a consultancy conversation or a
 * partnership, on its own board, from New to an end. Made by a public form after the person's
 * consent is recorded (P1, P7), by a proposal call booked (P2) or by the office. Its stage moves
 * along STAGE_MOVES (src/lib/pipeline/stages.ts), only through the operations: the staff's move
 * is MoveLead, from the board (src/lib/pipeline/core/moves.ts); no role types the stage or any
 * other field the platform keeps, in the admin's form or the API. Every move, call, note and
 * proposal is an entry in its timeline (`lead-activities`), which keeps `lastActivityAt` and
 * `touchedAt` for the first-reply clock (P3) and staleness (P4). The moves, the timeline's keys
 * and the title are the CRM builder's hooks (docs/17 §11); this file holds the fields and their
 * checks only. The Team Map's own record (`team_map_id`, docs/04) arrives with Release 2.
 */
export const Leads: CollectionConfig = {
  slug: 'leads',
  labels: { singular: 'Lead', plural: 'Leads' },
  admin: {
    group: 'Pipeline',
    useAsTitle: 'title',
    defaultColumns: ['title', 'kind', 'stage', 'owner', 'dueOn', 'lastActivityAt'],
    listSearchableFields: ['title'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.leads.read.roles),
  },
  access: {
    read: allow(POLICY.leads.read),
    create: allow(POLICY.leads.create),
    update: allow(POLICY.leads.update),
    delete: allow(POLICY.leads.delete),
  },
  defaultSort: '-createdAt',
  disableBulkEdit: true,
  // The title, the kind fixed once made, moves held to STAGE_MOVES and stamped, the stage-change
  // entry and the events (src/lib/pipeline/core/hooks.ts).
  hooks: { beforeChange: [prepareLead], afterChange: [recordLeadChange] },
  fields: [
    {
      // "<organisation> · Consultancy": named by the platform, never by a person's name alone.
      name: 'title',
      type: 'text',
      maxLength: 250,
      access: serverOnly,
      admin: { readOnly: true, position: 'sidebar', description: 'Named by the platform.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'kind',
          type: 'select',
          required: true,
          defaultValue: 'consultancy',
          index: true,
          options: [...LEAD_KINDS],
        },
        {
          // Moved only through MoveLead (the board's "Move to stage") and the platform's own
          // moves, never by typing it here or through the API: a new lead starts in New.
          name: 'stage',
          type: 'select',
          required: true,
          defaultValue: 'new',
          index: true,
          options: [...LEAD_STAGES],
          validate: validateStage,
          access: { create: serverOnly.create, update: serverOnly.update },
          admin: { description: 'Moved on the pipeline board.' },
        },
        instant('stageChangedAt', 'In this stage since'),
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'organisation',
          type: 'relationship',
          relationTo: 'organisations',
          index: true,
        },
        {
          // The person IIIC talks to about it.
          name: 'person',
          type: 'relationship',
          relationTo: 'people',
          label: 'Contact',
          index: true,
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'owner',
          type: 'relationship',
          relationTo: 'users',
          index: true,
          admin: { description: 'Who on the staff looks after it.' },
        },
        { name: 'nextAction', type: 'text', label: 'Next action', maxLength: 200 },
        istDayField('dueOn', 'Due', { index: true }),
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'source', type: 'select', required: true, options: [...LEAD_SOURCES] },
        {
          name: 'sourceNote',
          type: 'text',
          label: 'Source note',
          maxLength: 200,
          admin: { description: 'Who referred them, or where they heard of IIIC. Optional.' },
        },
      ],
    },
    {
      name: 'utm',
      type: 'group',
      label: 'Campaign (UTM)',
      admin: { description: 'The campaign tags on the link the request came from, if any.' },
      fields: [
        {
          type: 'row',
          fields: ['source', 'medium', 'campaign', 'term', 'content'].map((name) => ({
            name,
            type: 'text' as const,
            maxLength: 200,
            access: serverOnly,
          })),
        },
      ],
    },
    paiseField('valueEstimatePaise', 'Value estimate', {
      description: 'What it might be worth, in paise, if the office wants to note it. Optional.',
    }),
    {
      name: 'endReason',
      type: 'textarea',
      label: 'Why it ended',
      maxLength: 500,
      validate: validateEndReason,
      admin: {
        description: 'Required when it is lost or closed. Kept for the won-and-lost report.',
        condition: (data) => data?.stage === 'lost' || data?.stage === 'closed',
      },
    },
    {
      // The calls booked about it (P2), attached by the platform.
      name: 'calls',
      type: 'relationship',
      relationTo: 'bookings',
      hasMany: true,
      access: serverOnly,
      admin: { readOnly: true },
    },
    {
      // A request that came in after this lead's organisation's earlier lead had ended.
      name: 'previousLead',
      type: 'relationship',
      relationTo: 'leads',
      access: serverOnly,
      admin: { readOnly: true },
    },
    {
      type: 'row',
      fields: [
        instant('touchedAt', 'First acted on', 'When someone on the staff first acted on it.'),
        instant('lastActivityAt', 'Last activity'),
        instant('closedAt', 'Ended'),
      ],
    },
    {
      // What the alerts job has raised already, so each is raised once (P3, P4; docs/17 §7).
      name: 'alerts',
      type: 'group',
      admin: { readOnly: true },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'untouched',
              type: 'select',
              options: [...UNTOUCHED_LEVELS],
              access: serverOnly,
            },
            instant('staleFor', 'Stale since', 'The last activity a stale alert was raised for.'),
          ],
        },
      ],
    },
    {
      name: 'activities',
      type: 'join',
      collection: 'lead-activities',
      on: 'lead',
      defaultSort: '-at',
      admin: { defaultColumns: ['type', 'at', 'by'] },
    },
    {
      name: 'tasks',
      type: 'join',
      collection: 'tasks',
      on: 'lead',
      defaultSort: 'dueOn',
      admin: { defaultColumns: ['title', 'status', 'dueOn', 'role'] },
    },
    {
      name: 'proposals',
      type: 'join',
      collection: 'proposals',
      on: 'lead',
      defaultSort: '-createdAt',
      admin: { allowCreate: false, defaultColumns: ['reference', 'title', 'status'] },
    },
    {
      name: 'enquiries',
      type: 'join',
      collection: 'enquiries',
      on: 'lead',
      defaultSort: '-receivedAt',
      admin: { allowCreate: false, defaultColumns: ['kind', 'receivedAt', 'status'] },
    },
  ],
}
