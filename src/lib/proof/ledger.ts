import type {
  CollectionAfterChangeHook,
  CollectionBeforeDeleteHook,
  PayloadRequest,
  Where,
} from 'payload'

import { idOf, isWithdrawal } from '@/lib/privacy/consentLedger'
import { consentFor } from '@/lib/privacy/consents'

import { REVIEW_MESSAGES, slotCapacity, type Problem, type ReviewDraft } from './reviews'

/**
 * The review rules that read the database (docs/04 `testimonials`; D-37): whether the person's
 * consent to publish is in force, whether a page slot is free, and what a withdrawal or an
 * erasure does to a person's reviews. Collection hooks use these, so the module stays free of
 * `server-only`: the Payload CLI loads it too (src/lib/env.ts says why).
 */

/** The purpose a review's consent is for (docs/04 `consents`). */
export const PUBLICATION = 'testimonialPublication' as const

/** The flag on a request whose change to a review comes from the consent ledger or an erasure. */
export const BY_THE_LEDGER = 'reviewWithdrawnByTheLedger'

/**
 * Whether the consent a review links is one this person gave to publish a testimonial, and
 * whether that purpose is in force for them now (src/lib/privacy/consentLedger.ts): a review
 * is published only while it is (CLAUDE.md #4, D-37). Null when it holds.
 */
export async function consentProblem(
  req: PayloadRequest,
  review: Pick<ReviewDraft, 'person' | 'consent'>,
): Promise<Problem | null> {
  const person = idOf(review.person)
  if (person === null) return { path: 'person', message: REVIEW_MESSAGES.person }
  const consentId = idOf(review.consent)
  if (consentId === null) return { path: 'consent', message: REVIEW_MESSAGES.consent }
  const consent = await req.payload.findByID({
    collection: 'consents',
    id: consentId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  if (
    !consent ||
    isWithdrawal(consent) ||
    consent.purpose !== PUBLICATION ||
    String(idOf(consent.person)) !== String(person)
  ) {
    return { path: 'consent', message: REVIEW_MESSAGES.consentNotTheirs }
  }
  const state = await consentFor(req.payload, person, PUBLICATION, req)
  return state === 'granted'
    ? null
    : { path: 'consent', message: REVIEW_MESSAGES.consentNotInForce }
}

/** Reviews still in play: neither withdrawn nor declined. */
const IN_PLAY: Where = { status: { not_in: ['withdrawn', 'declined'] } }

/**
 * Whether each slot a review is pinned to has room for it (docs/11 §3.8): one review beside a
 * section, up to three cards on a counselling page, counting the other reviews still in play.
 */
export async function slotProblems(
  req: PayloadRequest,
  id: number | string | undefined,
  placements: ReviewDraft['placements'],
): Promise<Problem[]> {
  const problems: Problem[] = []
  for (const [index, placement] of (placements ?? []).entries()) {
    const page = placement.page ?? ''
    const section = placement.section ?? ''
    if (!page || !section) continue
    const { docs } = await req.payload.find({
      collection: 'testimonials',
      where: {
        and: [
          IN_PLAY,
          { 'placements.page': { equals: page } },
          ...(id === undefined ? [] : [{ id: { not_equals: id } }]),
        ],
      },
      depth: 0,
      limit: 100,
      pagination: false,
      select: { placements: true },
      overrideAccess: true,
      req,
    })
    const taken = docs.filter((doc) =>
      (doc.placements ?? []).some((other) => other.page === page && other.section === section),
    ).length
    const capacity = slotCapacity(page)
    if (taken >= capacity) {
      problems.push({
        path: `placements.${index}.section`,
        message: REVIEW_MESSAGES.slotTaken(page, section, capacity),
      })
    }
  }
  return problems
}

/**
 * Withdraws every review of a person that is still in play (docs/06 V2): each is unpublished at
 * once, and its words, translation, excerpt, photograph, link and placements are removed
 * (src/collections/Testimonials.ts). The consent entries stay in the ledger. Returns how many.
 */
export async function withdrawReviewsOf(
  req: PayloadRequest,
  personId: number | string,
): Promise<number> {
  const { docs } = await req.payload.find({
    collection: 'testimonials',
    where: { and: [IN_PLAY, { person: { equals: personId } }] },
    depth: 0,
    pagination: false,
    select: { status: true },
    overrideAccess: true,
    req,
  })
  for (const review of docs) {
    await req.payload.update({
      collection: 'testimonials',
      id: review.id,
      data: { status: 'withdrawn' },
      context: { [BY_THE_LEDGER]: true },
      overrideAccess: true,
      req,
    })
  }
  return docs.length
}

/**
 * When a person withdraws their consent to publish a testimonial (a reply, a call, the withdraw
 * link, or the erasure of their record), their reviews come down at once, in the same
 * transaction as the withdrawal (docs/04; docs/06 V2). A withdrawal of an earlier consent that a
 * newer one replaced leaves the purpose in force, and the reviews with it.
 */
export const withdrawReviewsOnWithdrawal: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create' || !isWithdrawal(doc) || doc.purpose !== PUBLICATION) return doc
  const person = idOf(doc.person)
  if (person === null) return doc
  if ((await consentFor(req.payload, person, PUBLICATION, req)) !== 'granted') {
    await withdrawReviewsOf(req, person)
  }
  return doc
}

/**
 * Deleting a person deletes their reviews with them (docs/04, Rules the schema enforces), in
 * the same transaction; the consent entries stay, marked withdrawn, without a person.
 */
export const deleteReviewsOnDeletion: CollectionBeforeDeleteHook = async ({ id, req }) => {
  await req.payload.delete({
    collection: 'testimonials',
    where: { person: { equals: id } },
    context: { [BY_THE_LEDGER]: true },
    overrideAccess: true,
    req,
  })
}
