import type { CollectionConfig } from 'payload'

import { allow, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'

/**
 * Who changed what, and when (docs/04 `audit_log`, docs/08 §9). One entry per change to a
 * collection, written in the same transaction as the change (src/plugins/auditLog.ts), and by
 * the staff sign-in endpoints for what they do. Owners read it in Settings; nobody edits or
 * deletes it, through Payload or in the database (a trigger, and the app's own role, D-43).
 * The actor is copied in, not linked, so the log never has to change. Kept 3 years (the
 * retention job comes with the other jobs, M6).
 */
export const AuditLog: CollectionConfig = {
  slug: 'audit-log',
  labels: { singular: 'Audit entry', plural: 'Audit log' },
  admin: {
    group: 'Settings',
    useAsTitle: 'action',
    defaultColumns: ['at', 'actorEmail', 'action', 'entity', 'entityId', 'changed'],
    hidden: ({ user }) => !hasRole(user, 'owner'),
  },
  access: {
    read: allow(POLICY.auditLog.read),
    create: allow(POLICY.auditLog.create),
    update: allow(POLICY.auditLog.update),
    delete: allow(POLICY.auditLog.delete),
  },
  defaultSort: '-at',
  disableBulkEdit: true,
  lockDocuments: false,
  timestamps: false,
  fields: [
    {
      name: 'at',
      type: 'date',
      required: true,
      index: true,
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    { name: 'actorId', type: 'text', index: true },
    { name: 'actorEmail', type: 'text' },
    { name: 'action', type: 'text', required: true },
    { name: 'entity', type: 'text', required: true, index: true },
    { name: 'entityId', type: 'text', index: true },
    {
      name: 'changed',
      type: 'text',
      admin: { description: 'The fields that changed, never their values.' },
    },
    { name: 'ip', type: 'text' },
  ],
}
