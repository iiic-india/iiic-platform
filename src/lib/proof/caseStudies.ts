import { type CollectionBeforeChangeHook, ValidationError } from 'payload'

import { hasRole, type MaybeStaff } from '@/access/roles'

/**
 * The rules of a case study (docs/04 `case_studies`; docs/05, Proof; docs/08 §6; docs/18 §6),
 * checked on every save, as a review's are (src/collections/Testimonials.ts):
 * - approved or published only with the client's written approval recorded: who approved, their
 *   role, the day, and where the signed file is kept;
 * - only an owner publishes, and only an owner changes a published case study, except to withdraw
 *   it (docs/05: anything that publishes proof needs an owner);
 * - who published it and when are the platform's, never typed (the fields refuse every role).
 * Not `server-only`: the Payload config loads it outside Next.js too.
 */

type Data = Record<string, unknown>

export const CASE_STUDY_MESSAGES = {
  approvalMissing:
    'Record the client’s written approval first: who approved it, their role, the day and where the signed file is kept.',
  ownerPublishes: 'Only an owner publishes a case study.',
  ownerChangesPublished: 'Only an owner changes a published case study. Anyone may withdraw it.',
} as const

const filled = (value: unknown) => typeof value === 'string' && value.trim() !== ''

/** Whether the client's approval is recorded in full (pure). */
export function approvalRecorded(approval: unknown): boolean {
  const record = (approval ?? {}) as Data
  return (
    filled(record.approverName) &&
    filled(record.approverRole) &&
    filled(record.approvedOn) &&
    filled(record.reference)
  )
}

/** What a save would break, as field paths and messages (pure). */
export function caseStudyProblems(
  next: { status?: unknown; clientApproval?: unknown },
  before: string | undefined,
  owner: boolean,
): { path: string; message: string }[] {
  const status = typeof next.status === 'string' ? next.status : 'draft'
  const problems: { path: string; message: string }[] = []
  if (before === 'published' && status !== 'withdrawn' && !owner) {
    problems.push({ path: 'status', message: CASE_STUDY_MESSAGES.ownerChangesPublished })
  } else if (status === 'published' && before !== 'published' && !owner) {
    problems.push({ path: 'status', message: CASE_STUDY_MESSAGES.ownerPublishes })
  }
  if ((status === 'approved' || status === 'published') && !approvalRecorded(next.clientApproval)) {
    problems.push({ path: 'clientApproval', message: CASE_STUDY_MESSAGES.approvalMissing })
  }
  return problems
}

export const checkCaseStudy: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (!data) return data
  const before = (originalDoc ?? {}) as Data
  const merged: Data = {
    ...before,
    ...(data as Data),
    clientApproval: {
      ...((before.clientApproval as Data) ?? {}),
      ...(((data as Data).clientApproval as Data) ?? {}),
    },
  }
  const previous = typeof before.status === 'string' ? before.status : undefined
  const problems = caseStudyProblems(merged, previous, hasRole(req.user as MaybeStaff, 'owner'))
  if (problems.length) throw new ValidationError({ collection: 'case-studies', errors: problems })
  const next = { ...(data as Data) }
  if (merged.status === 'published' && previous !== 'published') {
    next.publishedAt = new Date().toISOString()
    next.publishedBy = (req.user as { id?: number } | null)?.id ?? null
  }
  return next
}
