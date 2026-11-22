import {
  APIError,
  type CollectionAfterChangeHook,
  type CollectionAfterDeleteHook,
  type CollectionBeforeChangeHook,
  type PayloadHandler,
  type PayloadRequest,
} from 'payload'
import { z } from 'zod'

import { ownerWithCode } from '@/access/policy'
import { env } from '@/lib/env'
import type { BusyBlock, CalendarConnection } from '@/payload-types'

import { queueBusyRefresh } from './queue'

/**
 * The calendar collections' hooks and the feed-link endpoints (docs/16 §7, §12). The hooks keep a
 * connection's server fields true to the calendar it names and queue a busy-time refresh (B14)
 * when a calendar starts being read; they never reach Google themselves, so saving in the admin
 * never waits on it. The server's own writes from the calendar jobs carry `calendarSync` in
 * their context and are left alone.
 */

type Ref = number | { id: number } | null | undefined
const idOf = (value: Ref): number | null =>
  typeof value === 'number' ? value : (value?.id ?? null)

async function removeBusyBlocks(req: PayloadRequest, practitionerId: number | null) {
  if (!practitionerId) return
  await req.payload.delete({
    collection: 'busy-blocks',
    where: { practitioner: { equals: practitionerId } },
    overrideAccess: true,
    req,
  })
}

/**
 * A calendar address is kept as Google writes it, in lower case. When an owner points a
 * connection at another calendar, what was read from the old one (its watch channel, last read,
 * last failure) no longer applies and is cleared; the old channel runs out by itself.
 */
export const normaliseConnection: CollectionBeforeChangeHook<CalendarConnection> = ({
  context,
  data,
  operation,
  originalDoc,
}) => {
  if (typeof data.calendarId === 'string') data.calendarId = data.calendarId.trim().toLowerCase()
  if (
    operation === 'update' &&
    !context.calendarSync &&
    typeof data.calendarId === 'string' &&
    originalDoc &&
    data.calendarId !== originalDoc.calendarId
  ) {
    data.watch = { channelId: null, resourceId: null, expiresAt: null }
    data.channelTokenHash = null
    data.lastSyncedAt = null
    data.lastError = null
  }
  return data
}

/**
 * After an owner connects, changes or resumes a calendar: busy times copied from a calendar the
 * connection no longer names are removed, and a refresh is queued for any calendar now read.
 */
export const refreshAfterConnectionChange: CollectionAfterChangeHook<CalendarConnection> = async ({
  context,
  doc,
  operation,
  previousDoc,
  req,
}) => {
  if (context.calendarSync) return doc
  const practitionerId = idOf(doc.practitioner)
  const before = operation === 'update' ? previousDoc : null
  const formerPractitioner = before ? idOf(before.practitioner) : null
  const calendarChanged = Boolean(before && before.calendarId !== doc.calendarId)
  if (before && formerPractitioner !== practitionerId) {
    await removeBusyBlocks(req, formerPractitioner)
  } else if (calendarChanged) {
    await removeBusyBlocks(req, practitionerId)
  }
  const nowRead = doc.status !== 'paused'
  const changed =
    operation === 'create' ||
    calendarChanged ||
    before?.status !== doc.status ||
    formerPractitioner !== practitionerId
  if (nowRead && changed && practitionerId) await queueBusyRefresh(req, practitionerId)
  return doc
}

/** A connection removed takes the busy times copied from its calendar with it. */
export const removeBlocksWithConnection: CollectionAfterDeleteHook<CalendarConnection> = async ({
  doc,
  req,
}) => {
  await removeBusyBlocks(req, idOf(doc?.practitioner))
  return doc
}

/** A busy time ends after it starts; the server writes them, and this holds it to that. */
export const busyBlockInOrder: CollectionBeforeChangeHook<BusyBlock> = ({ data, originalDoc }) => {
  const start = new Date(data.startsAt ?? originalDoc?.startsAt ?? Number.NaN)
  const end = new Date(data.endsAt ?? originalDoc?.endsAt ?? Number.NaN)
  if (!(end > start)) throw new APIError('A busy time must end after it starts.', 400)
  return data
}

const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const ConnectionId = z.coerce.number().int().positive()

/** The user and role first (CLAUDE.md #6): an owner who has entered their two-factor code. */
function refusal(req: PayloadRequest): Response | null {
  if (!req.user) return json({ message: 'Sign in with your code to do this.' }, 401)
  if (!ownerWithCode({ req })) {
    return json({ message: 'Only an owner who has entered their code can do this.' }, 403)
  }
  return null
}

/**
 * POST /api/calendar-connections/:id/feed-link: makes a new private feed address for the
 * practitioner's bookings, replacing any earlier one, and returns it once (D-22).
 */
export const issueFeedLinkHandler: PayloadHandler = async (req) => {
  const refused = refusal(req)
  if (refused) return refused
  const id = ConnectionId.safeParse(req.routeParams?.id)
  if (!id.success) return json({ message: 'That calendar connection was not found.' }, 404)
  const { issueFeedLink } = await import('./feed')
  const issued = await issueFeedLink(req, { connectionId: id.data, siteUrl: env().siteUrl })
  if (!issued.ok) return json({ message: 'That calendar connection was not found.' }, 404)
  return json({ url: issued.value.url })
}

/** DELETE /api/calendar-connections/:id/feed-link: the feed address stops working at once. */
export const revokeFeedLinkHandler: PayloadHandler = async (req) => {
  const refused = refusal(req)
  if (refused) return refused
  const id = ConnectionId.safeParse(req.routeParams?.id)
  if (!id.success) return json({ message: 'That calendar connection was not found.' }, 404)
  const { revokeFeedLink } = await import('./feed')
  const revoked = await revokeFeedLink(req, { connectionId: id.data })
  if (!revoked.ok) return json({ message: 'That calendar connection was not found.' }, 404)
  return json({ ok: true })
}
