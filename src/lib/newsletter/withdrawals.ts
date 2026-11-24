import 'server-only'

import type { PayloadRequest, RequiredDataFromCollectionSlug } from 'payload'

import { inTransaction } from '@/lib/payments/store'
import { activeGrants, consentState, type LedgerEntry } from '@/lib/privacy/consentLedger'
import { CONSENT_PURPOSES, purposeLabel, type ConsentPurpose } from '@/lib/privacy/purposes'

/**
 * Withdrawing consents from a link (docs/19 §8, `/w/[token]`; docs/08 §3: withdrawing is as easy
 * as consenting). The ledger is append-only: a withdrawal is an entry of its own naming the
 * consent it ends, one for each consent of the purpose still in force, and the ledger's hooks do
 * the rest in the same transaction (reviews taken down, `consent.withdrawn` raised for V2 and N3).
 */

export type InForce = { purpose: ConsentPurpose; label: string; grantedAt: string }

type Entry = LedgerEntry & { id: number }

async function entriesOf(req: PayloadRequest, personId: number | string): Promise<Entry[]> {
  const { docs } = await req.payload.find({
    collection: 'consents',
    where: { person: { equals: personId } },
    pagination: false,
    depth: 0,
    select: { purpose: true, grantedAt: true, withdrawnAt: true, withdraws: true },
    overrideAccess: true,
    req,
  })
  return docs as unknown as Entry[]
}

/** The purposes a person's consent is in force for now, each with when it was given last. */
export async function consentsInForce(
  req: PayloadRequest,
  personId: number | string,
): Promise<InForce[]> {
  const entries = await entriesOf(req, personId)
  const shown: InForce[] = []
  for (const { value } of CONSENT_PURPOSES) {
    if (consentState(entries, value) !== 'granted') continue
    const given = activeGrants(entries)
      .filter((entry) => entry.purpose === value)
      .map((entry) => entry.grantedAt)
      .sort()
      .at(-1)
    if (given) shown.push({ purpose: value, label: purposeLabel(value), grantedAt: given })
  }
  return shown
}

/** Where a withdrawal came from, kept with it (docs/08 §3). */
export type WithdrawalEvidence = { form: string; ip?: string; userAgent?: string }

/**
 * Withdraws every consent of one purpose a person has in force (one entry each); returns how
 * many. Doing it twice changes nothing.
 */
export async function withdrawPurpose(
  req: PayloadRequest,
  input: {
    personId: number | string
    purpose: ConsentPurpose
    channel: 'web' | 'email'
    evidence: WithdrawalEvidence
  },
  now: Date,
): Promise<number> {
  return inTransaction(req, async () => {
    const entries = await entriesOf(req, input.personId)
    if (consentState(entries, input.purpose) !== 'granted') return 0
    const grants = activeGrants(entries).filter((entry) => entry.purpose === input.purpose)
    for (const grant of grants) {
      await req.payload.create({
        collection: 'consents',
        data: {
          withdraws: grant.id,
          channel: input.channel,
          withdrawnAt: now.toISOString(),
          evidence: {
            form: input.evidence.form,
            ...(input.evidence.ip ? { ip: input.evidence.ip.slice(0, 500) } : {}),
            ...(input.evidence.userAgent
              ? { userAgent: input.evidence.userAgent.slice(0, 500) }
              : {}),
          },
        } as unknown as RequiredDataFromCollectionSlug<'consents'>,
        overrideAccess: true,
        req,
      })
    }
    return grants.length
  })
}
