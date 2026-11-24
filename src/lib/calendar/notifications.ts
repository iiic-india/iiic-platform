import 'server-only'

import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import { err, ok, type Result } from '@/lib/result'

import type { CalendarDeps } from './config'
import { refreshBusyBlocksWith } from './sync'
import { tokenMatchesHash } from './tokens'

/**
 * Google's change notifications (B14; docs/07: `/api/webhooks/google-calendar`). Google posts an
 * empty body with headers naming the channel, the token the platform gave it, the watched
 * resource and what happened. A notification is believed only when its channel is one a
 * connection holds, its token matches the hash kept for that channel and its resource is the
 * one watched; then that practitioner's busy times are read again. Nothing in it names an event.
 */

/** The headers, as Zod reads them; anything else is refused before the database is asked. */
export const ChangeNotification = z.object({
  channelId: z.string().min(1).max(200),
  token: z.string().min(1).max(256),
  resourceId: z.string().min(1).max(500),
  state: z.enum(['sync', 'exists', 'not_exists']),
})

export type ChangeNotification = z.infer<typeof ChangeNotification>

/** Reads the notification's headers (the names Google sends, in any case). */
export function readNotification(headers: Headers) {
  return ChangeNotification.safeParse({
    channelId: headers.get('x-goog-channel-id'),
    token: headers.get('x-goog-channel-token'),
    resourceId: headers.get('x-goog-resource-id'),
    state: headers.get('x-goog-resource-state'),
  })
}

/** What became of a notification the platform believed. */
export type NotificationOutcome = 'sync' | 'ignored' | 'refreshed' | 'failed'

export type NotificationRefusal = { code: 'unknown-channel' } | { code: 'bad-token' }

export async function handleChangeNotificationWith(
  deps: CalendarDeps,
  req: PayloadRequest,
  notice: ChangeNotification,
  now: Date,
): Promise<Result<NotificationOutcome, NotificationRefusal>> {
  const { docs } = await req.payload.find({
    collection: 'calendar-connections',
    where: { 'watch.channelId': { equals: notice.channelId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    // The channel token's hash is hidden from every read but this check.
    showHiddenFields: true,
    req,
  })
  const connection = docs[0]
  if (!connection) return err({ code: 'unknown-channel' })
  if (
    !tokenMatchesHash(notice.token, connection.channelTokenHash) ||
    connection.watch?.resourceId !== notice.resourceId
  ) {
    return err({ code: 'bad-token' })
  }
  // The first message on a new channel says only that it is open.
  if (notice.state === 'sync') return ok('sync')
  const practitionerId =
    typeof connection.practitioner === 'number'
      ? connection.practitioner
      : connection.practitioner.id
  if (connection.status === 'paused') return ok('ignored')
  const refreshed = await refreshBusyBlocksWith(deps, req, { practitionerId, now })
  // A failed read is caught up by the 15-minute sweep (B14); Google is not asked to resend.
  return ok(refreshed.ok ? 'refreshed' : 'failed')
}
