import type { CollectionAfterChangeHook } from 'payload'

import { queueFromHook } from '@/lib/automations/operations/hookEvents'
import { idOf } from '@/lib/privacy/consentLedger'

/**
 * The collection hooks that raise builder C's events (docs/19 §2, §5), each in the change's own
 * transaction, ids only. Free of `server-only`: the collections load in the Payload CLI too.
 */

/** V1: a review moved to "Consent requested" raises `review.consentRequested`, once per move. */
export const raiseReviewConsentRequested: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  if (doc?.status === 'consentRequested' && previousDoc?.status !== 'consentRequested') {
    await queueFromHook(req, { name: 'review.consentRequested', testimonialId: Number(doc.id) })
  }
  return doc
}

/** V2 and N3: a withdrawal entered in the ledger raises `consent.withdrawn` with its own id. */
export const raiseConsentWithdrawn: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation === 'create' && idOf(doc?.withdraws) !== null) {
    await queueFromHook(req, { name: 'consent.withdrawn', consentId: Number(doc.id) })
  }
  return doc
}
