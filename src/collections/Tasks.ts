import type { CollectionConfig } from 'payload'

import { allow, allowField, FIELD_POLICY, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { istDayField } from '@/fields/istDay'
import { announceTask, holdTaskMoves } from '@/lib/pipeline/core/hooks'
import { TASK_KINDS, TASK_ROLES, TASK_STATUSES } from '@/lib/pipeline/values'
import { IST_FIELD } from '@/lib/time/ist'

const serverOnly = {
  read: allowField(FIELD_POLICY.serverOnly.read),
  create: allowField(FIELD_POLICY.serverOnly.write),
  update: allowField(FIELD_POLICY.serverOnly.write),
}

/**
 * Work for a person (docs/06, Engine rules: "Every automation that creates work for a person (a
 * task, an approval) assigns it to a role and shows on Today"; docs/17 §2): the first reply to a
 * request (P1, P7, due in two working days), the follow-up after a proposal (P5, three working
 * days), and anything the office adds. M4 makes them for leads; Today (M5) lists them. A task is
 * done or cancelled once (TASK_MOVES), which the CRM builder's hook holds; `key` keeps a retried
 * automation from making the same task twice.
 */
export const Tasks: CollectionConfig = {
  slug: 'tasks',
  labels: { singular: 'Task', plural: 'Tasks' },
  admin: {
    group: 'Pipeline',
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'dueOn', 'role', 'assignee', 'lead'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.tasks.read.roles),
  },
  access: {
    read: allow(POLICY.tasks.read),
    create: allow(POLICY.tasks.create),
    update: allow(POLICY.tasks.update),
    delete: allow(POLICY.tasks.delete),
  },
  defaultSort: 'dueOn',
  disableBulkEdit: true,
  // TASK_MOVES, doneAt and doneBy, and `task.created` (src/lib/pipeline/core/hooks.ts).
  hooks: { beforeChange: [holdTaskMoves], afterChange: [announceTask] },
  fields: [
    { name: 'title', type: 'text', required: true, maxLength: 200 },
    {
      type: 'row',
      fields: [
        {
          name: 'kind',
          type: 'select',
          required: true,
          defaultValue: 'other',
          options: [...TASK_KINDS],
        },
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'open',
          index: true,
          options: [...TASK_STATUSES],
        },
        istDayField('dueOn', 'Due', { required: true, index: true }),
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'role',
          type: 'select',
          required: true,
          defaultValue: 'operator',
          options: [...TASK_ROLES],
          admin: { description: 'Whose list it waits on.' },
        },
        {
          name: 'assignee',
          type: 'relationship',
          relationTo: 'users',
          index: true,
          admin: { description: 'Someone in particular, if not whoever holds the role.' },
        },
        { name: 'lead', type: 'relationship', relationTo: 'leads', index: true },
      ],
    },
    { name: 'note', type: 'textarea', maxLength: 1000 },
    {
      type: 'row',
      fields: [
        {
          name: 'doneAt',
          type: 'date',
          label: 'Done or cancelled',
          timezone: IST_FIELD,
          access: serverOnly,
          admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
        },
        {
          name: 'doneBy',
          type: 'relationship',
          relationTo: 'users',
          access: serverOnly,
          admin: { readOnly: true },
        },
        {
          // The automation that made it (docs/06 ids, such as P1), empty when made by hand.
          name: 'automation',
          type: 'text',
          maxLength: 40,
          access: serverOnly,
          admin: { readOnly: true },
        },
      ],
    },
    {
      // One task per cause, such as `P1:enquiry:42`: a retried job finds the task it made.
      name: 'key',
      type: 'text',
      unique: true,
      maxLength: 100,
      access: serverOnly,
      admin: { readOnly: true, position: 'sidebar' },
    },
  ],
}
