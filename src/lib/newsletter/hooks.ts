import {
  ValidationError,
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
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
