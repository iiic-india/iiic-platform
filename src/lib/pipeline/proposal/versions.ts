import { err, ok, type Result } from '@/lib/result'
import { istDay } from '@/lib/time/ist'
import type { ProposalVersion } from '@/payload-types'

import type { CreateVersion, ProposalError } from '../proposals'
import { PROPOSAL_ACTIVITY } from './copy'
import type { ProposalDeps } from './deps'
import { expireIfDue } from './expire'
import { feeTotalPaise } from './fees'
import { inTransaction, officeUser } from './guard'
import { clientNameOf, findLead, findProposal, lastVersionNumber } from './load'
import { newReference, versionReference } from './reference'
import { missingParts, snapshotOf } from './snapshot'
import { canMove } from './status'

/**
 * "Create version" (docs/17 §5): freezes the working copy as its next version, with the server's
 * fee total and who made it. Refused as `incomplete` while a printed part is empty, and as
 * `bad-move` once the client has answered. A sent, viewed or expired proposal goes back to draft;
 * the version the client holds keeps its link until the new one is sent.
 */
export function makeCreateVersion(deps: ProposalDeps): CreateVersion {
  return async (req, { proposalId }) => {
    const user = officeUser(req)
    if (!user) return err({ code: 'not-allowed' })
    const now = deps.now()
    return inTransaction(req, async (): Promise<Result<ProposalVersion, ProposalError>> => {
      const found = await findProposal(req, proposalId)
      if (!found) return err({ code: 'not-found' })
      const proposal = await expireIfDue(req, found, now, deps)
      if (proposal.status !== 'draft' && !canMove(proposal.status, 'draft')) {
        return err({ code: 'bad-move', from: proposal.status, to: 'draft' })
      }
      const lead = await findLead(req, proposal)
      if (!lead) return err({ code: 'not-found' })
      const clientName = await clientNameOf(req, lead)
      const missing = missingParts(proposal, clientName)
      if (missing.length || !clientName) return err({ code: 'incomplete', missing })

      const reference = proposal.reference ?? newReference()
      const number = (await lastVersionNumber(req, proposal.id)) + 1
      const document = snapshotOf(proposal, { clientName, date: istDay(now), reference, number })
      const version = await req.payload.create({
        collection: 'proposal-versions',
        data: {
          proposal: proposal.id,
          number,
          createdBy: user.id,
          document,
          feeTotalPaise: feeTotalPaise(document.fees),
        },
        depth: 0,
        overrideAccess: true,
        req,
      })
      await req.payload.update({
        collection: 'proposals',
        id: proposal.id,
        data: {
          currentVersion: version.id,
          ...(proposal.reference ? {} : { reference }),
          ...(proposal.status === 'draft' ? {} : { status: 'draft' as const }),
        },
        depth: 0,
        overrideAccess: true,
        req,
      })
      const logged = await deps.logActivity(req, {
        leadId: lead.id,
        type: 'proposal',
        body: PROPOSAL_ACTIVITY.versionMade(versionReference(reference, number)),
        at: now,
        by: user.id,
        about: { proposalVersionId: version.id },
      })
      if (!logged.ok) return err({ code: 'not-found' })
      await deps.emit(req, {
        name: 'proposal.versionCreated',
        proposalId: proposal.id,
        versionId: version.id,
      })
      return ok(version)
    })
  }
}
