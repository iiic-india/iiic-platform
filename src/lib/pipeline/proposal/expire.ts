import type { PayloadRequest } from 'payload'

import { ok } from '@/lib/result'
import { istDay } from '@/lib/time/ist'
import type { Proposal } from '@/payload-types'

import type { ExpireProposals } from '../proposals'
import type { ProposalDeps } from './deps'
import { inTransaction } from './guard'
import { isPastValidity } from './status'

/**
 * Expiry (P8, proposed; docs/17 §5): a sent or viewed proposal past the "valid until" day the
 * office gave becomes expired, by the job `P8-expire-proposals` or when an action next reads it.
 * Without a day it never expires. Idempotent: an expired proposal is past the statuses it moves
 * from, so a second run changes nothing and emits nothing.
 */

/** The proposal, expired first if its day has passed; inside the caller's transaction. */
export async function expireIfDue(
  req: PayloadRequest,
  proposal: Proposal,
  now: Date,
  deps: Pick<ProposalDeps, 'emit'>,
): Promise<Proposal> {
  if (!isPastValidity(proposal, now)) return proposal
  const expired = await req.payload.update({
    collection: 'proposals',
    id: proposal.id,
    data: { status: 'expired', expiredAt: now.toISOString() },
    depth: 0,
    overrideAccess: true,
    req,
  })
  await deps.emit(req, { name: 'proposal.expired', proposalId: proposal.id })
  return expired
}

export function makeExpireProposals(deps: Pick<ProposalDeps, 'emit'>): ExpireProposals {
  return async (req, now) => {
    const { docs } = await req.payload.find({
      collection: 'proposals',
      where: {
        and: [
          { status: { in: ['sent', 'viewed'] } },
          { validUntil: { exists: true } },
          { validUntil: { less_than: istDay(now) } },
        ],
      },
      depth: 0,
      limit: 500,
      sort: 'validUntil',
      overrideAccess: true,
      req,
    })
    let expired = 0
    for (const found of docs) {
      await inTransaction(req, async () => {
        // Read again inside the transaction: another run or an answer may have moved it.
        const proposal = await req.payload.findByID({
          collection: 'proposals',
          id: found.id,
          depth: 0,
          overrideAccess: true,
          req,
        })
        const after = await expireIfDue(req, proposal, now, deps)
        if (after.status === 'expired' && proposal.status !== 'expired') expired += 1
        return ok(null)
      })
    }
    return expired
  }
}
