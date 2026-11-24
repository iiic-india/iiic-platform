import 'server-only'

import {
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
import { ownPersonIds } from './seams'

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
 * over every record of the account.
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
    overrideAccess: true,
    req,
  })
  return docs.map(
    (doc): OwnRequestRow => ({
      id: doc.id,
      type: doc.type,
      receivedAt: new Date(doc.receivedAt),
      status: doc.status,
      resolveBy: doc.resolveBy ? new Date(doc.resolveBy) : null,
    }),
  )
}
