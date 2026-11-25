import 'server-only'

import type { PayloadRequest } from 'payload'

import {
  type AccountSession,
  type CreateOwnRequest,
  type ListOwnRequests,
  type OwnRequestRow,
  ownRequestInput,
} from '@/lib/accounts/contract'
import { env } from '@/lib/env'
import { actsHere } from '@/lib/messaging/deployment'
import { inTransaction } from '@/lib/payments/store'
import { deadlinesFor } from '@/lib/privacy/deadlines'
import { err, ok } from '@/lib/result'
import { IST } from '@/lib/time/ist'

import { NEEDS_RECENT_SIGN_IN, signedInRecently, SUMMARY_MAX } from './rules'
import { findOwnBookings, ownPersonIds } from './seams'

/**
 * Requests about one's data from My IIIC (docs/20 §7.5; docs/03 F11; docs/18 §5). A request is a
 * `data-requests` entry for the account's own record, made by the server: channel web, received
 * now, with the identity check the session's code gave (`oneTimeCode`, verified now). M5's rules
 * start it as received with its two clocks (src/lib/privacy/hooks.ts `requestRules`), and its
 * creation raises `dataRequest.received` in the same transaction, so O4 or O7 acknowledges it
 * (src/lib/automations/privacy/hooks.ts). Nothing is erased or exported here: the office moves
 * the request on, and an owner confirms an erasure, as for every request (docs/05, Privacy).
 */

/**
 * `CreateOwnRequest`: refused on a preview; a copy or an erasure only within ten minutes of
 * signing in (D-121), checked before anything is read; one open request of each kind at a time,
 * over every record of the account; and refused, writing nothing, for an account whose row has
 * gone since its session was read.
 */
export const createOwnRequest: CreateOwnRequest = async (req, account, input, now) => {
  if (!actsHere(env().VERCEL_ENV)) return err({ code: 'closed-here' })
  const parsed = ownRequestInput.safeParse(input)
  if (!parsed.success || parsed.data.summary.length > SUMMARY_MAX) {
    return err({ code: 'invalid-input' })
  }
  const { type, summary } = parsed.data
  if (NEEDS_RECENT_SIGN_IN.includes(type) && !signedInRecently(account, now)) {
    return err({ code: 'sign-in-again' })
  }
  const ids = await ownPersonIds(req, account)
  // No records: the account's row has gone since the session was read (closed in another tab,
  // or erased), so nothing is written for it.
  if (ids.length === 0) return err({ code: 'closed-here' })
  return inTransaction(req, async () => {
    const open = await req.payload.count({
      collection: 'data-requests',
      where: {
        and: [
          { person: { in: ids } },
          { type: { equals: type } },
          { status: { not_equals: 'closed' } },
        ],
      },
      // scope: a count of the open requests of the account's own records (the ids from ownPersonIds)
      overrideAccess: true,
      req,
    })
    if (open.totalDocs > 0) return err({ code: 'open-request-exists' as const })
    const request = await req.payload.create({
      collection: 'data-requests',
      data: {
        type,
        // requestRules records every new request as received, whatever is sent.
        status: 'received',
        person: account.personId,
        channel: 'web',
        receivedAt: now.toISOString(),
        receivedAt_tz: IST,
        summary,
        verifiedAt: now.toISOString(),
        verifiedAt_tz: IST,
        verificationMethod: 'oneTimeCode',
      },
      // scope: a request on the account's own record (account.personId), and no other
      overrideAccess: true,
      req,
    })
    // The clocks are the collection's own (requestRules); the same rule, should a read omit them.
    const clocks = deadlinesFor(type, now)
    return ok({
      requestId: request.id,
      acknowledgeBy: request.acknowledgeBy ? new Date(request.acknowledgeBy) : clocks.acknowledgeBy,
      resolveBy: request.resolveBy ? new Date(request.resolveBy) : clocks.resolveBy,
    })
  })
}

/** `ListOwnRequests`: the requests of every record of the account, latest first. */
export const listOwnRequests: ListOwnRequests = async (req, account) => {
  const ids = await ownPersonIds(req, account)
  const { docs } = await req.payload.find({
    collection: 'data-requests',
    where: { person: { in: ids } },
    sort: '-receivedAt',
    pagination: false,
    depth: 0,
    select: { type: true, receivedAt: true, status: true, resolveBy: true },
    // scope: the requests of the account's own records (the ids from ownPersonIds); kind, dates and state only
    overrideAccess: true,
    req,
  })
  return docs.map((doc): OwnRequestRow => ({
    id: doc.id,
    type: doc.type,
    receivedAt: new Date(doc.receivedAt),
    status: doc.status,
    resolveBy: doc.resolveBy ? new Date(doc.resolveBy) : null,
  }))
}

/** What a correction request may show of the booking it names, and nothing more. */
export type NamedBooking = { reference: string; counselling: boolean }

const idOf = (value: unknown): number | null =>
  typeof value === 'number'
    ? value
    : value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'number'
      ? (value as { id: number }).id
      : null

/**
 * The booking a correction request names ("Not your booking?", docs/20 §7.2): its reference, and
 * whether it is counselling, so that the page draws the scope statement and the crisis numbers and
 * offers nothing beside it (CLAUDE.md #3, #9). Read through B's scope, so only one of the
 * account's own bookings is found; any other reference is null, as one that does not exist
 * (D-127). Nothing else of the booking is read.
 */
export async function namedBooking(
  req: PayloadRequest,
  account: AccountSession,
  reference: string,
): Promise<NamedBooking | null> {
  const ids = await ownPersonIds(req, account)
  const [row] = await findOwnBookings(req, ids, {
    select: { reference: true, type: true, service: true },
    where: { reference: { equals: reference } },
    limit: 1,
  })
  if (!row) return null
  // As My IIIC's own booking pages decide it (src/lib/accounts/bookings.ts, registerOf): a
  // session is counselling whatever its service says, and so is any booking of a counselling
  // service.
  if (row.type === 'session') return { reference: row.reference, counselling: true }
  const serviceId = idOf(row.service)
  if (serviceId === null) return { reference: row.reference, counselling: false }
  const { docs } = await req.payload.find({
    collection: 'services',
    where: { id: { equals: serviceId } },
    select: { register: true },
    limit: 1,
    depth: 0,
    // scope: the service of the account's own booking just found, by the id it names; its register only.
    overrideAccess: true,
    req,
  })
  return { reference: row.reference, counselling: docs[0]?.register === 'counselling' }
}
