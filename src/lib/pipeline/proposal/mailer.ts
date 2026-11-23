import type { Payload } from 'payload'

import { err, ok } from '@/lib/result'

import type { ProposalMailer } from '../proposals'
import { PROPOSAL_EMAIL } from './copy'

/**
 * The proposal email (P5; docs/17 §5) through the platform's mail adapter: Payload's `sendEmail`,
 * Resend once its key is set (src/payload.config.ts), else the adapter that sends nothing. One
 * address, the reference in the subject, the link in the body, no amount. A failure is an answer
 * (`mail-failed`), never logged with the address or the words.
 */
export function payloadProposalMailer(payload: Payload): ProposalMailer {
  return async (message) => {
    try {
      const sent = (await payload.sendEmail({
        to: message.to,
        subject: PROPOSAL_EMAIL.subject(message.reference),
        text: PROPOSAL_EMAIL.text(message),
      })) as { id?: unknown } | null | undefined
      return ok({ messageId: typeof sent?.id === 'string' ? sent.id : null })
    } catch {
      payload.logger.warn('The proposal email was not sent.')
      return err({ code: 'mail-failed' })
    }
  }
}

/** A message the fake mailer was given, for the tests. */
export type MailedProposal = Parameters<ProposalMailer>[0]

/** A mailer that keeps what it is given, or fails on request: for the tests. */
export function fakeProposalMailer({ fail = false }: { fail?: boolean } = {}): ProposalMailer & {
  sent: MailedProposal[]
} {
  const sent: MailedProposal[] = []
  const mailer = async (message: MailedProposal) => {
    if (fail) return err({ code: 'mail-failed' as const })
    sent.push(message)
    return ok({ messageId: `fake-${sent.length}` })
  }
  return Object.assign(mailer, { sent })
}
