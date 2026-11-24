import 'server-only'

import type { PayloadRequest } from 'payload'

import { TEMPLATE_KEYS, templateSpec, type TemplateKey } from '@/emails/registry'
import { idOf } from '@/lib/privacy/consentLedger'
import { err, ok } from '@/lib/result'
import { readQuietHours } from '@/lib/settings/source'
import { IST } from '@/lib/time/ist'

import { defaultMessagingDeps, type MessagingDeps } from './deps'
import { messageKey, type CancelQueued, type Deliver, type PlannedMessage } from './operations'
import { recordRow } from './outbox'
import { queueTiming } from './policy'
import { cancelQueuedRows, inCallersTransaction } from './store'
import { tryMessage } from './try'
import type { SkipReason } from './types'

/**
 * Planning a message (docs/19 §3): the automations (builders B and C) call `deliver` with what to
 * send, to whom and when; the core writes one `messages` row under the message's unique key and,
 * when it is due now, tries it. A key already recorded returns that row and sends nothing, so a
 * job that runs twice sends once (§2, layer 2). Quiet hours are applied here, at planning, and
 * again when the message is due. The row holds ids, the timing and the state; never a body, an
 * address or anything said in counselling (CLAUDE.md #3).
 */

/** Whether a booking is a counselling session: its service belongs to the counselling door. */
async function isCounsellingBooking(req: PayloadRequest, bookingId: number): Promise<boolean> {
  const booking = await req.payload.findByID({
    collection: 'bookings',
    id: bookingId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    select: { service: true },
    req,
  })
  const serviceId = booking ? idOf((booking as Record<string, unknown>).service) : null
  if (serviceId === null) return false
  const service = await req.payload.findByID({
    collection: 'services',
    id: Number(serviceId),
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    select: { register: true, type: true },
    req,
  })
  const record = (service ?? {}) as Record<string, unknown>
  return record.register === 'counselling' || record.type === 'session'
}

const validId = (id: unknown): id is number =>
  typeof id === 'number' && Number.isInteger(id) && id > 0

/** When the planned message is queued for (src/lib/messaging/policy.ts, `queueTiming`). */
async function timing(
  req: PayloadRequest,
  planned: PlannedMessage,
): Promise<{ sendAt: Date; skip?: SkipReason }> {
  const quiet = planned.channel === 'whatsapp' ? await readQuietHours(req.payload) : undefined
  return queueTiming(planned, quiet)
}

export function deliverWith(deps: MessagingDeps): Deliver {
  return async (req, planned, options) => {
    if (!(TEMPLATE_KEYS as readonly string[]).includes(planned.template)) {
      return err({ code: 'unknown-template' })
    }
    const spec = templateSpec(planned.template as TemplateKey)
    if (!spec.channels.includes(planned.channel)) return err({ code: 'channel-not-allowed' })
    if (planned.fallback && !spec.channels.includes(planned.fallback)) {
      return err({ code: 'channel-not-allowed' })
    }
    if (!validId(planned.recipient?.id) || !validId(planned.subject?.id)) {
      return err({ code: 'recipient-missing' })
    }
    // Internal mail goes to staff only, and nothing but internal mail goes to a staff account.
    if ((spec.kind === 'internal') !== (planned.recipient.kind === 'staff')) {
      return err({ code: 'recipient-missing' })
    }
    const dedupeKey = messageKey({
      automation: planned.automation,
      subject: planned.subject,
      variant: planned.variant,
      channel: planned.channel,
    })
    const counselling =
      planned.subject.collection === 'bookings'
        ? await isCounsellingBooking(req, planned.subject.id)
        : false
    const { sendAt, skip } = await timing(req, planned)
    const { recipient } = planned
    const { message, created } = await recordRow(req, {
      dedupeKey,
      automation: planned.automation,
      template: planned.template,
      variant: planned.variant ?? null,
      channel: planned.channel,
      fallback: planned.fallback && planned.fallback !== planned.channel ? planned.fallback : null,
      kind: spec.kind,
      sender: spec.sender,
      status: skip ? 'skipped' : 'queued',
      skipReason: skip ?? null,
      recipientKind: recipient.kind,
      person: recipient.kind === 'person' ? recipient.id : null,
      subscriber: recipient.kind === 'subscriber' ? recipient.id : null,
      staff: recipient.kind === 'staff' ? recipient.id : null,
      subjectCollection: planned.subject.collection,
      subjectId: planned.subject.id,
      counselling,
      sendAt: sendAt.toISOString(),
      sendAt_tz: IST,
      sendBefore: planned.sendBefore ? planned.sendBefore.toISOString() : null,
      sendBefore_tz: planned.sendBefore ? IST : null,
      requiresOpenWindow: Boolean(planned.requiresOpenWindow),
      attempts: 0,
    })
    let status = message.status
    // Due now: try it once the row has committed. Inside a caller's transaction the row is not
    // committed yet, so the dispatcher sends it within the minute (claim, commit, send).
    if (
      created &&
      status === 'queued' &&
      !options?.queueOnly &&
      sendAt.getTime() <= deps.now().getTime() &&
      !(await inCallersTransaction(req))
    ) {
      await tryMessage(req, deps, message.id, options?.transient)
      const after = await req.payload.findByID({
        collection: 'messages',
        id: message.id,
        depth: 0,
        disableErrors: true,
        overrideAccess: true,
        select: { status: true },
        req,
      })
      status = after?.status ?? status
    }
    return ok({ messageId: message.id, created, status })
  }
}

export const deliver: Deliver = (req, planned, options) =>
  deliverWith(defaultMessagingDeps())(req, planned, options)

/** Cancels the queued messages about a subject (docs/19 §6): a reschedule, a cancellation, a payment. */
export const cancelQueued: CancelQueued = (req, scope) =>
  cancelQueuedRows(req, scope.subject, scope.automations, new Date(), scope.keepKeys)
