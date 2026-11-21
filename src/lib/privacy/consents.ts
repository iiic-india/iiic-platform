import type { Payload, PayloadRequest, RequiredDataFromCollectionSlug } from 'payload'

import { activeGrants, consentState, type ConsentState, type LedgerEntry } from './consentLedger'
import type { ConsentPurpose } from './purposes'

/**
 * Reading and writing the consent ledger on the server (docs/04 `consents`). Collection hooks
 * use these, so the module stays free of `server-only`: the Payload CLI loads it too
 * (src/lib/env.ts says why).
 */

/** The flag a withdrawal made because a person's record is deleted carries on its request. */
export const RECORD_DELETED = 'consentWithdrawnByDeletion'

const LEDGER_FIELDS = {
  purpose: true,
  grantedAt: true,
  withdrawnAt: true,
  withdraws: true,
} as const

/** Every ledger entry about a person: their consents and their withdrawals. */
async function entriesOf(
  payload: Payload,
  personId: number | string,
  req?: PayloadRequest,
): Promise<LedgerEntry[]> {
  const { docs } = await payload.find({
    collection: 'consents',
    where: { person: { equals: personId } },
    pagination: false,
    depth: 0,
    select: LEDGER_FIELDS,
    overrideAccess: true,
    req,
  })
  return docs as LedgerEntry[]
}

/**
 * Where a person stands on one purpose (src/lib/privacy/consentLedger.ts): a promotional message
 * goes out only while this says "granted" (docs/06, Engine rules: Consent).
 */
export async function consentFor(
  payload: Payload,
  personId: number | string,
  purpose: ConsentPurpose,
): Promise<ConsentState> {
  return consentState(await entriesOf(payload, personId), purpose)
}

/**
 * When a person's record is deleted, their consents are marked withdrawn (docs/04, Rules the
 * schema enforces): one withdrawal for each consent still in force, in the deletion's own
 * transaction, so the ledger keeps what they had agreed to and when it ended. Returns how many.
 */
export async function withdrawOnDeletion(
  req: PayloadRequest,
  personId: number | string,
): Promise<number> {
  const active = activeGrants(await entriesOf(req.payload, personId, req))
  for (const grant of active) {
    // The ledger takes the person, purpose, notice, language and time from the consent it
    // ends (completeEntry in src/collections/Consents.ts).
    const withdrawal = { withdraws: grant.id, channel: 'recordDeleted' }
    await req.payload.create({
      collection: 'consents',
      data: withdrawal as unknown as RequiredDataFromCollectionSlug<'consents'>,
      context: { [RECORD_DELETED]: true },
      overrideAccess: true,
      req,
    })
  }
  return active.length
}

/**
 * The consent text a form shows for a purpose now: the version in force that took effect last,
 * in the language asked for. Null while none is in force, and then the form does not ask.
 */
export async function currentNotice(
  payload: Payload,
  purpose: ConsentPurpose,
  language: string,
  now: Date = new Date(),
) {
  const { docs } = await payload.find({
    collection: 'consent-versions',
    where: {
      and: [
        { purpose: { equals: purpose } },
        { language: { equals: language } },
        { effectiveFrom: { less_than_equal: now.toISOString() } },
      ],
    },
    sort: ['-effectiveFrom', '-version'],
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return docs[0] ?? null
}
