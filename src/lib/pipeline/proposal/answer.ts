import type { PayloadRequest } from 'payload'

import { err, ok, type Result } from '@/lib/result'

import type { ProposalError, RecordAnswer } from '../proposals'
import { PROPOSAL_ACTIVITY } from './copy'
import type { ProposalDeps } from './deps'
import { expireIfDue } from './expire'
import { inTransaction, officeUser } from './guard'
import { findLead, findProposal, findVersion, patchVersion } from './load'
import { readSnapshot } from './snapshot'
import { canMove, idOf } from './status'

/**
 * What the client answered (docs/17 §5): accepted or declined, recorded by the office with a note
 * in its own words. The template's "Accepted for …" is signed outside the platform, so the link
 * has no accept button. Accepted and declined are final; a declined proposal's link closes, an
 * accepted one's stays open. The owner or an operator, with the code.
 */
export function makeRecordAnswer(deps: ProposalDeps): RecordAnswer {
  return async (req, { proposalId, answer, note, by }) => {
    const user = officeUser(req)
    if (!user || user.id !== by) return err({ code: 'not-allowed' })
    const now = deps.now()
    return inTransaction(req, async (): Promise<Result<{ proposalId: number }, ProposalError>> => {
      const found = await findProposal(req, proposalId)
      if (!found) return err({ code: 'not-found' })
      const proposal = await expireIfDue(req, found, now, deps)
      if (!canMove(proposal.status, answer)) {
        return err({ code: 'bad-move', from: proposal.status, to: answer })
      }
      const lead = await findLead(req, proposal)
      if (!lead) return err({ code: 'not-found' })
      const sentId = idOf(proposal.sentVersion)
      const sent = sentId === null ? null : await findVersion(req, sentId)
      const reference = (sent && readSnapshot(sent.document)?.reference) ?? proposal.reference ?? ''
      const at = now.toISOString()
      await req.payload.update({
        collection: 'proposals',
        id: proposal.id,
        data: {
          status: answer,
          ...(answer === 'accepted' ? { acceptedAt: at } : { declinedAt: at }),
          ...(note?.trim() ? { answerNote: note.trim() } : {}),
        },
        depth: 0,
        overrideAccess: true,
        req,
      })
      const logged = await deps.logActivity(req, {
        leadId: lead.id,
        type: 'proposal',
        body: PROPOSAL_ACTIVITY[answer](reference),
        at: now,
        by: user.id,
        ...(sentId === null ? {} : { about: { proposalVersionId: sentId } }),
      })
      if (!logged.ok) return err({ code: 'not-found' })
      await deps.emit(req, {
        name: answer === 'accepted' ? 'proposal.accepted' : 'proposal.declined',
        proposalId: proposal.id,
      })
      return ok({ proposalId: proposal.id })
    })
  }
}

/**
 * Withdraws a sent version's link (docs/17 §5, "withdrawn"): it answers the neutral page from
 * then on, while the proposal's status stays as it is. For a link sent to the wrong address or
 * a proposal sent too soon; sending the version again issues a new link. The office, with the code.
 */
export type WithdrawLink = (
  req: PayloadRequest,
  input: { versionId: number },
) => Promise<Result<{ versionId: number }, ProposalError>>

export function makeWithdrawLink(deps: Pick<ProposalDeps, 'now'>): WithdrawLink {
  return async (req, { versionId }) => {
    if (!officeUser(req)) return err({ code: 'not-allowed' })
    return inTransaction(req, async (): Promise<Result<{ versionId: number }, ProposalError>> => {
      const version = await findVersion(req, versionId)
      if (!version) return err({ code: 'not-found' })
      if (!version.sending?.sentAt) return err({ code: 'not-sent' })
      if (version.sending.linkRevokedAt || version.sending.supersededAt) {
        return err({ code: 'link-closed' })
      }
      await patchVersion(req, version.id, { sending: { linkRevokedAt: deps.now().toISOString() } })
      return ok({ versionId: version.id })
    })
  }
}
