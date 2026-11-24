import 'server-only'

import type { PayloadRequest, RequiredDataFromCollectionSlug } from 'payload'

import { emitAutomationEvent } from '@/lib/automations/emit'
import { activeGrants, idOf, type LedgerEntry } from '@/lib/privacy/consentLedger'
import type { ConsentChannel, ConsentPurpose } from '@/lib/privacy/purposes'
import { err, ok, type Result } from '@/lib/result'

import { verifyLink } from './links'

/**
 * Withdrawals that arrive through a message (docs/08 §3: withdrawing is as easy as consenting;
 * docs/13 §6, §7; docs/19 §4, §8): a STOP on WhatsApp, the one-click unsubscribe, the unsubscribe
 * and withdraw pages. Each is recorded in the consent ledger as an entry of its own that names the
 * consent it ends (src/collections/Consents.ts), before anything else happens, and raises
 * `consent.withdrawn` (V2, N3). A promotional message already queued is then skipped when it comes
 * due, because the core reads the ledger at send time.
 */

export type WithdrawalEvidence = {
  /** Which form, link or message it came through, e.g. "one-click unsubscribe". */
  form?: string
  /** Where the evidence is kept, e.g. the provider's message id of a STOP. */
  reference?: string
  ip?: string
  userAgent?: string
}

/**
 * Ends every consent in force for the purpose; returns the withdrawals made. A consent another
 * request withdrew at the same moment is skipped (the ledger holds one withdrawal per consent).
 */
export async function withdrawPurpose(
  req: PayloadRequest,
  input: {
    personId: number
    purpose: ConsentPurpose
    channel: Exclude<ConsentChannel, 'recordDeleted'>
    evidence?: WithdrawalEvidence
  },
): Promise<number[]> {
  const { docs } = await req.payload.find({
    collection: 'consents',
    where: { person: { equals: input.personId } },
    pagination: false,
    depth: 0,
    select: { purpose: true, grantedAt: true, withdrawnAt: true, withdraws: true },
    overrideAccess: true,
    req,
  })
  const grants = activeGrants(docs as LedgerEntry[]).filter(
    (entry) => entry.purpose === input.purpose,
  )
  const made: number[] = []
  for (const grant of grants) {
    const evidence = input.evidence ?? {}
    const data = {
      withdraws: Number(idOf(grant.id)),
      channel: input.channel,
      evidence: {
        form: evidence.form?.slice(0, 500),
        reference: evidence.reference?.slice(0, 500),
        ip: evidence.ip?.slice(0, 500),
        userAgent: evidence.userAgent?.slice(0, 500),
      },
    }
    try {
      // The ledger copies the person, purpose, notice, language and time from the consent.
      const entry = await req.payload.create({
        collection: 'consents',
        data: data as unknown as RequiredDataFromCollectionSlug<'consents'>,
        overrideAccess: true,
        req,
      })
      made.push(entry.id)
      await emitAutomationEvent(req, { name: 'consent.withdrawn', consentId: entry.id })
    } catch (error) {
      // Withdrawn by another request just now: the ledger already says so.
      const { totalDocs } = await req.payload
        .count({
          collection: 'consents',
          where: { withdraws: { equals: grant.id } },
          overrideAccess: true,
          req,
        })
        .catch(() => ({ totalDocs: 0 }))
      if (totalDocs === 0) throw error
    }
  }
  return made
}

export type LinkWithdrawalError = { code: 'invalid' | 'expired' | 'not-found' }

/**
 * A withdrawal from a signed link (src/lib/messaging/links.ts): the withdraw page names a person,
 * the unsubscribe link a newsletter subscriber (whose person, once confirmed, holds the consent).
 * For builder C's pages and the one-click endpoint, which add the subscriber's own status.
 */
export async function withdrawFromLink(
  req: PayloadRequest,
  input: {
    link: 'withdraw' | 'unsubscribe'
    token: string
    purpose: ConsentPurpose
    evidence?: WithdrawalEvidence
  },
): Promise<Result<{ personId: number | null; withdrawn: number[] }, LinkWithdrawalError>> {
  const verified = await verifyLink(input.link, input.token)
  if (!verified.ok) return err(verified.error)
  let personId: number | null = verified.value.subjectId
  if (input.link === 'unsubscribe') {
    const subscriber = await req.payload.findByID({
      collection: 'subscribers',
      id: verified.value.subjectId,
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
      select: { person: true },
      req,
    })
    if (!subscriber) return err({ code: 'not-found' })
    const linked = idOf((subscriber as Record<string, unknown>).person)
    personId = linked === null ? null : Number(linked)
  }
  if (personId === null) return ok({ personId: null, withdrawn: [] })
  const withdrawn = await withdrawPurpose(req, {
    personId,
    purpose: input.purpose,
    channel: 'web',
    evidence: input.evidence,
  })
  return ok({ personId, withdrawn })
}
