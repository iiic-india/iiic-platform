import { err, ok } from '@/lib/result'

import type { SendVersion } from '../proposals'
import { PROPOSAL_SENT_STAGE } from '../stages'
import { PROPOSAL_FOLLOW_UP_WORKING_DAYS } from '../tasks'
import { PROPOSAL_ACTIVITY } from './copy'
import type { ProposalDeps } from './deps'
import { expireIfDue } from './expire'
import { inTransaction, officeUser } from './guard'
import {
  clientNameOf,
  findLead,
  findProposal,
  findVersion,
  patchVersion,
  recipientOf,
} from './load'
import { printSnapshot } from './preview'
import { readSnapshot } from './snapshot'
import { canMove, idOf, leadMovesOnSend } from './status'
import { linkPath, newLinkToken } from './tokens'

/**
 * "Send" (docs/05 "Send a proposal"; P5; docs/17 §5). In one transaction: print the version
 * (refused with placeholders; its fees section only while the fees rule lets it print), record
 * the copy's SHA-256, issue the tracked link
 * (only its hash kept), close the link of a version sent before it, set the proposal sent, bring
 * a consultancy lead to Proposal sent if it is earlier, log the send, make the follow-up task due
 * in three working days and emit `proposal.sent`. Then, once that has committed, email the link
 * and record when. The token lives only in this call: if the email fails, the proposal stays
 * sent and the office is shown the link once; sending again issues a new link and closes this
 * one. Only the proposal's current version is sent. The owner or an operator, with the code.
 */
export function makeSendVersion(deps: ProposalDeps): SendVersion {
  return async (req, { versionId, by }) => {
    const user = officeUser(req)
    if (!user || user.id !== by) return err({ code: 'not-allowed' })
    const now = deps.now()
    const token = newLinkToken()

    const committed = await inTransaction(req, async () => {
      const version = await findVersion(req, versionId)
      if (!version) return err({ code: 'not-found' as const })
      const found = await findProposal(req, idOf(version.proposal) ?? -1)
      if (!found) return err({ code: 'not-found' as const })
      const proposal = await expireIfDue(req, found, now, deps)
      if (idOf(proposal.currentVersion) !== version.id) {
        // An older version is never sent: the office sends the latest it made.
        return err({ code: 'bad-move' as const, from: proposal.status, to: 'sent' })
      }
      const resend = proposal.status === 'sent' || proposal.status === 'viewed'
      if (!resend && !canMove(proposal.status, 'sent')) {
        return err({ code: 'bad-move' as const, from: proposal.status, to: 'sent' })
      }
      const lead = await findLead(req, proposal)
      if (!lead) return err({ code: 'not-found' as const })
      const recipient = await recipientOf(req, lead)
      if (!recipient) return err({ code: 'no-recipient' as const })
      const snapshot = readSnapshot(version.document)
      if (!snapshot) return err({ code: 'not-found' as const })

      const printed = await printSnapshot(req, version.id, deps)
      if (!printed.ok) return printed

      const previous = idOf(proposal.sentVersion)
      if (previous !== null && previous !== version.id) {
        await patchVersion(req, previous, { sending: { supersededAt: now.toISOString() } })
      }
      await patchVersion(req, version.id, {
        linkTokenHash: token.hash,
        pdf: { sha256: printed.value.sha256, renderedAt: now.toISOString() },
        sending: {
          sentAt: now.toISOString(),
          sentBy: user.id,
          sentTo: recipient.personId,
          emailedAt: null,
          supersededAt: null,
          linkRevokedAt: null,
        },
      })
      await req.payload.update({
        collection: 'proposals',
        id: proposal.id,
        data: { sentVersion: version.id, ...(resend ? {} : { status: 'sent' as const }) },
        depth: 0,
        overrideAccess: true,
        req,
      })
      if (leadMovesOnSend(lead)) {
        const moved = await deps.moveLead(req, {
          leadId: lead.id,
          to: PROPOSAL_SENT_STAGE,
          by: null,
        })
        if (!moved.ok) return err({ code: 'not-found' as const })
      }
      const logged = await deps.logActivity(req, {
        leadId: lead.id,
        type: 'proposal',
        body: PROPOSAL_ACTIVITY.sent(snapshot.reference),
        at: now,
        by: user.id,
        about: { proposalVersionId: version.id },
      })
      if (!logged.ok) return err({ code: 'not-found' as const })
      const task = await deps.createTask(req, {
        kind: 'proposalFollowUp',
        title: PROPOSAL_ACTIVITY.followUpTask,
        dueOn: deps.addWorkingDays(now, PROPOSAL_FOLLOW_UP_WORKING_DAYS),
        role: 'operator',
        assigneeId: idOf(lead.owner) ?? undefined,
        leadId: lead.id,
        automation: 'P5',
        key: `P5:version:${version.id}`,
      })
      if (!task.ok) return err({ code: 'not-found' as const })
      await deps.emit(req, {
        name: 'proposal.sent',
        proposalId: proposal.id,
        versionId: version.id,
      })
      return ok({
        to: recipient.email,
        reference: snapshot.reference,
        clientName: (await clientNameOf(req, lead)) ?? snapshot.clientName,
      })
    })
    if (!committed.ok) return committed

    // After the commit: the email, which cannot be taken back, goes only once the send stands.
    const linkUrl = new URL(linkPath(token.token), deps.siteUrl).toString()
    const mailed = await deps.mailerFor(req)({ ...committed.value, linkUrl })
    if (mailed.ok) {
      await patchVersion(req, versionId, { sending: { emailedAt: deps.now().toISOString() } })
    }
    return ok({ linkUrl, mailed: mailed.ok })
  }
}
