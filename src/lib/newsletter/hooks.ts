import {
  ValidationError,
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  type FieldHook,
} from 'payload'

import { queueFromHook } from '@/lib/automations/operations/hookEvents'

import { issueChangeProblem, issueNeedsSend, type IssueState } from './issueRules'

/**
 * The hooks of `newsletter-issues` (docs/19 §8; docs/06 N4). Free of `server-only`: the
 * collections load in the Payload CLI too. Only N4 itself moves an issue to `sending` and `sent`
 * (it passes `context.newsletterSend`); an editor drafts, schedules and cancels.
 */

/** The flag N4 sets on its own updates, so these rules let the send through. */
export const NEWSLETTER_SEND_CONTEXT = 'newsletterSend'

/** The states of a message that left for its subscriber. */
export const REACHED: readonly string[] = ['sent', 'delivered', 'read']

/**
 * An issue's "Sent to", read from the messages log: N4 only plans one message per subscriber and
 * the dispatcher sends them over the next minutes, so the figure is the messages about this issue
 * that have left, counted when the issue is read. Nothing before the issue is sending.
 */
export const countIssueSends: FieldHook = async ({ data, req, value }) => {
  const doc = (data ?? {}) as Record<string, unknown>
  const id = doc.id
  if (typeof id !== 'number' || (doc.status !== 'sending' && doc.status !== 'sent')) return value
  const { totalDocs } = await req.payload.count({
    collection: 'messages',
    where: {
      and: [
        { subjectCollection: { equals: 'newsletter-issues' } },
        { subjectId: { equals: id } },
        { status: { in: [...REACHED] } },
      ],
    },
    overrideAccess: true,
    req,
  })
  return totalDocs
}

const state = (doc: Record<string, unknown> | undefined): IssueState | null =>
  doc
    ? {
        status: (doc.status as IssueState['status']) ?? 'draft',
        scheduledFor: (doc.scheduledFor as string | null | undefined) ?? null,
      }
    : null

/** Refuses what an editor may not do to an issue, beside the field, before anything is saved. */
export const guardIssue: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (req.context?.[NEWSLETTER_SEND_CONTEXT]) return data
  const next = state({ ...(originalDoc ?? {}), ...data })
  if (!next) return data
  const problem = issueChangeProblem(state(originalDoc), next, new Date())
  if (problem) {
    throw new ValidationError({
      collection: 'newsletter-issues',
      errors: [{ path: problem.path, message: problem.message }],
    })
  }
  return data
}

/** Scheduling an issue, or moving its time, raises `newsletter.issueScheduled` for N4. */
export const raiseIssueScheduled: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  if (req.context?.[NEWSLETTER_SEND_CONTEXT]) return doc
  if (issueNeedsSend(state(previousDoc), state(doc))) {
    await queueFromHook(req, { name: 'newsletter.issueScheduled', issueId: Number(doc.id) })
  }
  return doc
}
