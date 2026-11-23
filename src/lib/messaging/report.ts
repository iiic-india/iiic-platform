import 'server-only'

import type { PayloadRequest } from 'payload'

import { emitAutomationEvent, type EmitAutomationEvent } from '@/lib/automations/emit'
import type { AutomationId } from '@/lib/automations/catalogue'
import { countOutcome } from '@/lib/automations/rows'
import { idOf } from '@/lib/privacy/consentLedger'
import { err, ok } from '@/lib/result'
import type { Message } from '@/payload-types'

import type { ApplyReport, ProviderReport } from './operations'
import { move, type MoveFields } from './store'
import { suppress } from './suppress'
import type { MessageStatus } from './types'

/**
 * A provider's report about a message it sent, from a verified webhook (docs/19 §4): the message
 * moves forward only, by conditional update, so a late or replayed report changes nothing. A
 * permanent bounce or a complaint also suppresses the address the provider tried (O9 and N3 run
 * from the suppression's own event); a transient bounce marks the message failed with
 * `soft-bounce` and suppresses nothing. A failure the provider reports counts against the
 * automation and raises `message.failed` (O3). Nothing of the report is logged.
 */

type Plan = { from: readonly MessageStatus[]; to: MessageStatus; fields: MoveFields }

/** Where the report takes the message, and from which statuses. */
export function planFor(report: ProviderReport): Plan {
  switch (report.status) {
    case 'delivered':
      return { from: ['sent'], to: 'delivered', fields: { deliveredAt: report.at } }
    case 'read':
      return { from: ['sent', 'delivered'], to: 'read', fields: { readAt: report.at } }
    case 'complained':
      return { from: ['sent', 'delivered', 'read'], to: 'complained', fields: {} }
    case 'bounced':
      return report.bounce === 'permanent'
        ? { from: ['sent', 'delivered'], to: 'bounced', fields: {} }
        : { from: ['sent'], to: 'failed', fields: { lastError: 'soft-bounce' } }
    case 'failed':
      return { from: ['sent'], to: 'failed', fields: { lastError: 'provider-failed' } }
  }
}

async function messageFor(req: PayloadRequest, report: ProviderReport): Promise<Message | null> {
  const { docs } = await req.payload.find({
    collection: 'messages',
    where: {
      and: [
        // The fake senders stand in for either provider locally and in CI.
        { provider: { in: [report.provider, 'fake'] } },
        { providerMessageId: { equals: report.providerMessageId } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return docs[0] ?? null
}

export function applyReportWith(emit: EmitAutomationEvent): ApplyReport {
  return async (req, report) => {
    const message = await messageFor(req, report)
    if (!message) return err({ code: 'unknown-message' })
    const plan = planFor(report)
    const at = new Date()
    const moved = await move(req, message.id, plan.from, plan.to, plan.fields, at)
    const suppresses =
      report.status === 'complained' ||
      (report.status === 'bounced' && report.bounce === 'permanent')
    if (suppresses && report.address) {
      const personId = idOf(message.person)
      // Unique per channel and address: a replay finds the entry and adds nothing.
      await suppress(req, {
        channel: message.channel,
        address: report.address,
        reason: report.status === 'complained' ? 'complaint' : 'hardBounce',
        source: report.provider === 'resend' ? 'resend' : 'whatsapp',
        ...(personId === null ? {} : { personId: Number(personId) }),
      })
    }
    if (moved && plan.to === 'failed') {
      await countOutcome(req, message.automation as AutomationId, 'failure', at)
      await emit(req, { name: 'message.failed', messageId: message.id })
    }
    return ok({ messageId: message.id, moved })
  }
}

export const applyReport: ApplyReport = applyReportWith(emitAutomationEvent)
