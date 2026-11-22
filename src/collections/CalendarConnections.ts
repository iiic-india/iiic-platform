import type { CollectionConfig } from 'payload'

import { allow, allowField, FIELD_POLICY, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import {
  issueFeedLinkHandler,
  normaliseConnection,
  refreshAfterConnectionChange,
  removeBlocksWithConnection,
  revokeFeedLinkHandler,
} from '@/lib/calendar/connectionHooks'
import { IST_FIELD } from '@/lib/time/ist'

const serverOnly = {
  read: allowField(FIELD_POLICY.serverOnly.read),
  create: allowField(FIELD_POLICY.serverOnly.write),
  update: allowField(FIELD_POLICY.serverOnly.write),
}

const instant = (name: string, label: string) => ({
  name,
  type: 'date' as const,
  label,
  timezone: IST_FIELD,
  access: serverOnly,
  admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' as const } },
})

/**
 * A practitioner's Google Calendar, as the platform reaches it (docs/04 `calendar_connections`;
 * D-22, D-23). The platform reads only free and busy times from it (never an event's title or
 * guests) and writes each booking to it with a Meet link or the office address. Access is a
 * Workspace service account with domain-wide delegation limited to the Calendar scope, so no
 * token is stored here (docs/16 §7). The watch channel's own token, which proves a change
 * notification came from Google for this channel, is hidden from every read.
 */
export const CalendarConnections: CollectionConfig = {
  slug: 'calendar-connections',
  labels: { singular: 'Calendar connection', plural: 'Calendar connections' },
  admin: {
    group: 'Calendar',
    defaultColumns: ['practitioner', 'calendarId', 'status', 'lastSyncedAt'],
    hidden: ({ user }) => !hasRole(user, 'owner', 'operator', 'practitioner'),
  },
  access: {
    read: allow(POLICY.calendarConnections.read),
    create: allow(POLICY.calendarConnections.create),
    update: allow(POLICY.calendarConnections.update),
    delete: allow(POLICY.calendarConnections.delete),
  },
  // src/lib/calendar/connectionHooks.ts: server fields kept true to the calendar named, a
  // busy-time refresh queued when a calendar starts being read (B14), and the practitioner's
  // private feed link made or revoked by an owner with their code (D-22).
  hooks: {
    beforeChange: [normaliseConnection],
    afterChange: [refreshAfterConnectionChange],
    afterDelete: [removeBlocksWithConnection],
  },
  endpoints: [
    { path: '/:id/feed-link', method: 'post', handler: issueFeedLinkHandler },
    { path: '/:id/feed-link', method: 'delete', handler: revokeFeedLinkHandler },
  ],
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'practitioner',
          type: 'relationship',
          relationTo: 'practitioners',
          required: true,
          unique: true,
        },
        {
          name: 'provider',
          type: 'select',
          required: true,
          defaultValue: 'google',
          options: [{ label: 'Google Calendar', value: 'google' }],
        },
        {
          // The practitioner's own Workspace calendar, usually their address on the platform
          // domain (I-24).
          name: 'calendarId',
          type: 'text',
          label: 'Calendar',
          required: true,
          maxLength: 200,
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'paused',
          options: [
            { label: 'Paused (not read or written)', value: 'paused' },
            { label: 'Connected', value: 'connected' },
            { label: 'Failing', value: 'failing' },
          ],
          admin: {
            description: 'Paused until an owner has checked the calendar is the right one.',
          },
        },
        instant('lastSyncedAt', 'Busy times last read'),
        {
          // A short code for the last failure, never a message body or an address.
          name: 'lastError',
          type: 'text',
          label: 'Last failure',
          maxLength: 100,
          access: serverOnly,
          admin: { readOnly: true },
        },
      ],
    },
    {
      // Google's change notifications (B14): the channel, its resource and when it ends.
      name: 'watch',
      type: 'group',
      label: 'Change notifications',
      access: serverOnly,
      admin: { readOnly: true },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'channelId', type: 'text', maxLength: 100, unique: true },
            { name: 'resourceId', type: 'text', maxLength: 200 },
            instant('expiresAt', 'Renew before'),
          ],
        },
      ],
    },
    {
      // Proves a notification came for this channel: compared on the server, never shown.
      name: 'channelTokenHash',
      type: 'text',
      hidden: true,
    },
    {
      // The practitioner's private feed of their bookings (D-22): the hash of the feed link's
      // token; the link itself is shown once when made.
      name: 'feedTokenHash',
      type: 'text',
      unique: true,
      hidden: true,
    },
  ],
}
