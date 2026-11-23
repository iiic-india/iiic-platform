import 'server-only'

import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import { plan } from '@/lib/automations/operations/core'
import { done, RecordId, type Outcome } from '@/lib/automations/operations/outcome'
import { after, OFFSETS } from '@/lib/automations/timing'
import { idOf } from '@/lib/privacy/consentLedger'
import { PUBLICATION } from '@/lib/proof/ledger'

/**
 * The review automations (docs/06 V1, V2; docs/content/review-consent-request.md; D-37).
 *
 * V1 · on `review.consentRequested` (the office moved a review to "Consent requested"): the
 * consent request by email now, and its one reminder five days on. The reminder's `load` answers
 * `stale` once the review has left "Consent requested" (the reply was recorded, or it was
 * declined), so it is skipped; no reply means no publication, and nothing more is sent. A message
 * on WhatsApp is sent by hand inside a conversation the person opened (docs/19 §10).
 *
 * V2 · on `consent.withdrawn` for publishing a testimonial: the person is told it is done. The
 * unpublishing itself happens in the ledger's own hook, in the withdrawal's transaction (M2).
 */

const ReviewEvent = z.object({ testimonialId: RecordId })

export async function runV1(req: PayloadRequest, input: unknown, now: Date): Promise<Outcome> {
  const { testimonialId } = ReviewEvent.parse(input)
  const review = await req.payload.findByID({
    collection: 'testimonials',
    id: testimonialId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  if (!review) return done(0, 'not-found')
  if (review.status !== 'consentRequested') return done(0, 'not-requested')
  const personId = idOf(review.person)
  if (personId === null) return done(0, 'no-person')

  const base = {
    automation: 'V1' as const,
    channel: 'email' as const,
    recipient: { kind: 'person' as const, id: Number(personId) },
    subject: { collection: 'testimonials' as const, id: review.id },
  }
  const request = await plan(req, { ...base, template: 'review-consent-request', sendAt: now })
  if (!request.ok) return done(0, request.error.code)
  const reminder = await plan(req, {
    ...base,
    template: 'review-consent-reminder',
    variant: 'reminder',
    sendAt: after(now, OFFSETS.reviewConsentReminder),
  })
  const planned = Number(request.value.created) + Number(reminder.ok && reminder.value.created)
  return reminder.ok ? done(planned) : done(planned, reminder.error.code)
}

const ConsentEvent = z.object({ consentId: RecordId })

export async function runV2(req: PayloadRequest, input: unknown, now: Date): Promise<Outcome> {
  const { consentId } = ConsentEvent.parse(input)
  const withdrawal = await req.payload.findByID({
    collection: 'consents',
    id: consentId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  if (!withdrawal || withdrawal.purpose !== PUBLICATION) return done(0, 'other-purpose')
  if (idOf(withdrawal.withdraws) === null) return done(0, 'not-a-withdrawal')
  // A withdrawal made because the record was deleted has nobody left to tell.
  if (withdrawal.channel === 'recordDeleted') return done(0, 'record-deleted')
  const personId = idOf(withdrawal.person)
  if (personId === null) return done(0, 'no-person')
  const result = await plan(req, {
    automation: 'V2',
    template: 'review-withdrawal-confirmed',
    channel: 'email',
    recipient: { kind: 'person', id: Number(personId) },
    subject: { collection: 'consents', id: withdrawal.id },
    sendAt: now,
  })
  return result.ok ? done(result.value.created ? 1 : 0) : done(0, result.error.code)
}
