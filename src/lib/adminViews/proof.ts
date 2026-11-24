import 'server-only'

import type { PayloadRequest } from 'payload'

import { hasRole, type MaybeStaff } from '@/access/roles'
import { CASE_STUDY_STATUSES } from '@/collections/CaseStudies'
import { REVIEW_STATUSES } from '@/lib/proof/reviews'
import { ok, type Result } from '@/lib/result'

import type { ViewError } from './contract'
import { asUser, refused } from './shared'

/**
 * Proof moderation (docs/05, Proof; docs/18 §6): new feedback to read, reviews by where they
 * stand, and case studies waiting for the client's approval or an owner. Asks `viewRefusal(user,
 * 'proof')` first; every read is with the user's own access. Feedback shows its rating and time,
 * never the comment, which is read on the record; an owner-only act (publishing) is offered to
 * owners only, and the collections check it again.
 */

export type ProofData = {
  feedback: { id: number; rating: number; submittedAt: string }[]
  reviews: {
    counts: { status: string; label: string; count: number }[]
    waiting: { id: number; title: string; status: string }[]
  }
  caseStudies: { id: number; title: string; status: string; label: string }[]
  /** Whether this user may publish (an owner): the collections check it again on save. */
  publishes: boolean
}

/** The reviews that wait for someone at IIIC to take the next step. */
const WAITING = ['received', 'screened', 'consentRequested', 'approved']

export async function loadProof(req: PayloadRequest): Promise<Result<ProofData, ViewError>> {
  const refusal = refused(req, 'proof')
  if (refusal) return refusal
  const user = asUser(req)
  const feedback = await req.payload.find({
    collection: 'feedback',
    where: { status: { equals: 'new' } },
    sort: 'submittedAt',
    limit: 50,
    depth: 0,
    select: { rating: true, submittedAt: true },
    ...user,
  })
  const counts = []
  for (const status of REVIEW_STATUSES) {
    const { totalDocs } = await req.payload.count({
      collection: 'testimonials',
      where: { status: { equals: status.value } },
      ...user,
    })
    counts.push({ status: status.value, label: status.label, count: totalDocs })
  }
  const waiting = await req.payload.find({
    collection: 'testimonials',
    where: { status: { in: WAITING } },
    sort: 'updatedAt',
    limit: 50,
    depth: 0,
    select: { title: true, status: true },
    ...user,
  })
  const caseStudies = await req.payload.find({
    collection: 'case-studies',
    where: { status: { in: ['awaitingApproval', 'approved'] } },
    sort: 'updatedAt',
    limit: 50,
    depth: 0,
    select: { title: true, status: true },
    ...user,
  })
  const labelOf = (list: readonly { value: string; label: string }[], value: string) =>
    list.find((entry) => entry.value === value)?.label ?? value
  return ok({
    feedback: feedback.docs.map((doc) => ({
      id: doc.id,
      rating: doc.rating,
      submittedAt: doc.submittedAt,
    })),
    reviews: {
      counts,
      waiting: waiting.docs.map((doc) => ({
        id: doc.id,
        title: doc.title ?? `Review ${doc.id}`,
        status: labelOf(REVIEW_STATUSES, doc.status),
      })),
    },
    caseStudies: caseStudies.docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      status: doc.status,
      label: labelOf(CASE_STUDY_STATUSES, doc.status),
    })),
    publishes: hasRole(req.user as MaybeStaff, 'owner'),
  })
}
