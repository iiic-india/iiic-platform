import type { PayloadRequest } from 'payload'

import type { DeliverOptions, PlannedMessage } from '@/lib/messaging/operations'
import type { MessageStatus } from '@/lib/messaging/types'
import type { ProposalMailer } from '@/lib/pipeline/proposals'
import { err, ok, type Result } from '@/lib/result'

/**
 * The proposal email (P5; docs/17 §5; docs/19 §5) through M6's messaging core, in place of M4's
 * plain mailer: the React Email template `proposal-sent`, one `messages` row per send (the key
 * names the version and the send's moment, so sending again is a new message), sent at once after
 * the send has committed, with the core's checks as they are then (the automation's switch, the
 * suppression list, the channel's set-up, no price while prices are hidden, no placeholder in
 * production). The tracked link goes to the core as `transient` data: it reaches the template on
 * this one try and is never written to the row, a job or a log, since its token is kept only as
 * a hash (D-93). A send that does not go now is not left in the queue, where it could only be
 * skipped later: it is cancelled, and the office is shown the link once instead (M4's rule).
 *
 * Free of `server-only` (the proposal wiring is reached by the collections' endpoints); the core
 * is loaded when the first email goes.
 */

type Planned = { messageId: number; created: boolean; status: MessageStatus }

export type ProposalMailCore = {
  plan: (
    req: PayloadRequest,
    planned: PlannedMessage,
    options?: DeliverOptions,
  ) => Promise<Result<Planned, { code: string }>>
  cancelQueued: (
    req: PayloadRequest,
    scope: { subject: PlannedMessage['subject']; automations?: readonly 'P5'[] },
  ) => Promise<number>
}

async function joinedCore(): Promise<ProposalMailCore> {
  const { plan, cancelPlanned } = await import('@/lib/automations/operations/core')
  return { plan, cancelQueued: cancelPlanned }
}

/** The message this send plans: about the proposal, to the person it was sent to. */
export function proposalMessage(message: Parameters<ProposalMailer>[0], now: Date): PlannedMessage {
  return {
    automation: 'P5',
    template: 'proposal-sent',
    channel: 'email',
    recipient: { kind: 'person', id: message.personId },
    subject: { collection: 'proposals', id: message.proposalId },
    variant: `v${message.versionId}-${Date.parse(message.sentAt)}`,
    sendAt: now,
  }
}

export function coreProposalMailer(
  req: PayloadRequest,
  core?: ProposalMailCore,
  now: () => Date = () => new Date(),
): ProposalMailer {
  return async (message) => {
    const port = core ?? (await joinedCore())
    const planned = proposalMessage(message, now())
    const result = await port.plan(req, planned, {
      transient: {
        linkUrl: message.linkUrl,
        reference: message.reference,
        clientName: message.clientName,
      },
    })
    if (!result.ok) return err({ code: 'mail-failed' })
    if (result.value.status === 'sent') return ok({ messageId: String(result.value.messageId) })
    if (result.value.status === 'queued') {
      await port.cancelQueued(req, { subject: planned.subject, automations: ['P5'] })
    }
    return err({ code: 'mail-failed' })
  }
}
