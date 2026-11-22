import type { CollectionConfig } from 'payload'

import { allow, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { EVENT_NAMES, REGISTERS, WHO_FOR_OPTIONS } from '@/lib/analytics/events'
import { IST_FIELD } from '@/lib/time/ist'

/**
 * The funnel's events (docs/04 `analytics_events`, S0; docs/12 §7), written on the server by
 * src/lib/analytics/record.ts and never through the API. No field links to a person, by design:
 * an event holds what happened, where, for whom where the step asks, a pseudonymous session code
 * that changes every day (src/lib/analytics/session.ts) and when. Owners read the raw events;
 * Reports and the weekly report aggregate them (M5, O2). Not in the audit log: nobody's data
 * changes here (docs/08 §2, src/plugins/auditLog.ts).
 */
export const AnalyticsEvents: CollectionConfig = {
  slug: 'analytics-events',
  labels: { singular: 'Analytics event', plural: 'Analytics events' },
  admin: {
    group: 'Reports',
    defaultColumns: ['at', 'name', 'route', 'register', 'whoFor'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.analyticsEvents.read.roles),
    description:
      'The funnel, one event at a time, with no link to any person. Written by the platform only.',
  },
  access: {
    read: allow(POLICY.analyticsEvents.read),
    create: allow(POLICY.analyticsEvents.create),
    update: allow(POLICY.analyticsEvents.update),
    delete: allow(POLICY.analyticsEvents.delete),
  },
  defaultSort: '-at',
  disableBulkEdit: true,
  lockDocuments: false,
  // The event's own time is its only one: an event never changes.
  timestamps: false,
  indexes: [{ fields: ['name', 'at'] }],
  fields: [
    { name: 'name', type: 'select', label: 'Event', options: [...EVENT_NAMES], required: true },
    { name: 'route', type: 'text', label: 'Page', required: true, maxLength: 200 },
    { name: 'register', type: 'select', options: [...REGISTERS], required: true },
    { name: 'whoFor', type: 'select', label: 'Who for', options: WHO_FOR_OPTIONS },
    {
      name: 'sessionHash',
      type: 'text',
      label: 'Session',
      required: true,
      index: true,
      admin: {
        description:
          'A code that changes every day, worked out on the server from the address and browser, which are not kept.',
      },
    },
    {
      name: 'at',
      type: 'date',
      required: true,
      index: true,
      timezone: IST_FIELD,
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
}
