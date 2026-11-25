import 'server-only'

import type { PayloadRequest, RequiredDataFromCollectionSlug } from 'payload'

import {
  type AccountSession,
  GIVABLE_PURPOSES,
  type GivablePurpose,
  type GiveConsent,
  giveConsentInput,
  type ListOwnConsents,
  type WithdrawConsent,
} from '@/lib/accounts/contract'
import { clientIp } from '@/lib/audit/record'
import { emitAutomationEvent } from '@/lib/automations/emit'
import { env } from '@/lib/env'
import { channelsFor } from '@/lib/messaging/channelsFor'
import { actsHere } from '@/lib/messaging/deployment'
import { type WithdrawalEvidence, withdrawPurpose } from '@/lib/newsletter/withdrawals'
import { inTransaction } from '@/lib/payments/store'
import { currentNotice } from '@/lib/privacy/consents'
import { err, ok } from '@/lib/result'

import {
  consentRows,
  endedByClosing,
  isConsentPurpose,
  mayOffer,
  type OfferFacts,
  type OwnLedgerEntry,
  standingOf,
} from './rules'
import { ownPersonIds } from './seams'

/**
 * Consents from My IIIC (docs/20 §7.5; D-119): the list of what the account's records have agreed
 * to, the two marketing consents given under their notice in force, and a withdrawal of any
 * consent in force, at once. Every function starts from the signed-in account's own records
 * (`ownPersonIds`) and touches no other (docs/20 §8). The ledger stays the ledger's: a consent is
 * one entry, channel web, with the form, the address and the browser the server read as its
 * evidence; a withdrawal is `withdrawPurpose`, the withdraw page's own, for each record that
 * holds the purpose. The ledger's hooks take reviews down and raise `consent.withdrawn` in the
 * same transaction (V2, N3), and the messaging core reads the ledger before every promotional
 * send, so a withdrawal stops the matching sends at once.
 */

/** The language of the notices My IIIC shows (en-IN for now; CLAUDE.md, Conventions). */
const LANGUAGE = 'en-IN'

/** The evidence's form, and the subscriber's source, for what is done here. */
export const MY_IIIC_FORM = 'My IIIC'

/** Where a consent or a withdrawal from this page came from: the form, the address, the browser. */
export function evidenceOf(req: PayloadRequest): WithdrawalEvidence {
  const ip = clientIp(req)
  const userAgent = req.headers?.get('user-agent')
  return {
    form: MY_IIIC_FORM,
    ...(ip ? { ip: ip.slice(0, 500) } : {}),
    ...(userAgent ? { userAgent: userAgent.slice(0, 500) } : {}),
  }
}

/** Every ledger entry about the account's records: consents and withdrawals. */
async function ledgerOf(req: PayloadRequest, ids: number[]): Promise<OwnLedgerEntry[]> {
  const { docs } = await req.payload.find({
    collection: 'consents',
    where: { person: { in: ids } },
    pagination: false,
    depth: 0,
    select: { person: true, purpose: true, grantedAt: true, withdrawnAt: true, withdraws: true },
    // scope: the ledger entries of the account's own records only (the ids from ownPersonIds)
    overrideAccess: true,
    req,
  })
  return docs as unknown as OwnLedgerEntry[]
}

/** Whether any record of the account says under 18: then nothing is offered (docs/20 §4.10). */
async function anyUnder18(req: PayloadRequest, ids: number[]): Promise<boolean> {
  const { totalDocs } = await req.payload.count({
    collection: 'people',
    where: { and: [{ id: { in: ids } }, { ageBand: { equals: 'under18' } }] },
    // scope: a count of the account's own records (the ids from ownPersonIds) that say under 18; nothing of them is read
    overrideAccess: true,
    req,
  })
  return totalDocs > 0
}

type Notice = { id: number; text: string }

async function noticesInForce(
  req: PayloadRequest,
  now: Date,
): Promise<Partial<Record<GivablePurpose, Notice>>> {
  const notices: Partial<Record<GivablePurpose, Notice>> = {}
  for (const purpose of GIVABLE_PURPOSES) {
    const notice = await currentNotice(req.payload, purpose, LANGUAGE, now)
    if (notice) notices[purpose] = { id: notice.id, text: notice.text }
  }
  return notices
}

async function offerFacts(
  req: PayloadRequest,
  account: AccountSession,
  ids: number[],
  notices: Partial<Record<GivablePurpose, Notice>>,
): Promise<OfferFacts> {
  return {
    notices: Object.fromEntries(
      Object.entries(notices).map(([purpose, notice]) => [purpose, notice?.id ?? null]),
    ),
    under18: await anyUnder18(req, ids),
    verifiedEmail: Boolean(account.verified.email),
    verifiedMobile: Boolean(account.verified.mobile),
    whatsAppOpen: channelsFor(env()).configured.whatsapp,
  }
}

/**
 * `ListOwnConsents`: every purpose on record for the account's records, with where it stands
 * and when it changed, and the marketing consents My IIIC may offer, each with the notice in
 * force (its id and its words, for the box beside it).
 */
export const listOwnConsents = (async (req, account) => {
  const now = new Date()
  const ids = await ownPersonIds(req, account)
  const entries = await ledgerOf(req, ids)
  const notices = await noticesInForce(req, now)
  const facts = await offerFacts(req, account, ids, notices)
  return consentRows(entries, facts).map((row) => ({
    ...row,
    noticeText: row.canGive ? (notices[row.purpose as GivablePurpose]?.text ?? null) : null,
  }))
}) satisfies ListOwnConsents

export type OwnConsentRow = Awaited<ReturnType<typeof listOwnConsents>>[number]

/**
 * Adds the account's verified email to the newsletter as confirmed, after the consent (docs/20
 * §7.5): the address is already proven by its code, so no second confirmation email. The entry
 * is linked to the consent and the person, as /api/newsletter/confirm links it, and
 * `newsletter.confirmed` is raised when the entry becomes confirmed, so N2 welcomes them once.
 */
async function joinTheJournal(
  req: PayloadRequest,
  input: { email: string; personId: number; consentId: number; noticeId: number },
  now: Date,
): Promise<void> {
  const email = input.email.trim().toLowerCase()
  const { docs } = await req.payload.find({
    collection: 'subscribers',
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    select: { status: true },
    // scope: the newsletter entry of the account's own verified email, and only it; its status is read
    overrideAccess: true,
    req,
  })
  const existing = docs[0]
  const confirmed = {
    status: 'confirmed' as const,
    source: MY_IIIC_FORM,
    notice: input.noticeId,
    person: input.personId,
    consent: input.consentId,
    confirmedAt: now.toISOString(),
    confirmTokenHash: null,
  }
  const entry = existing
    ? await req.payload.update({
        collection: 'subscribers',
        id: existing.id,
        data: confirmed,
        // scope: that same entry, linked to the account's own record and the consent just given
        overrideAccess: true,
        req,
      })
    : await req.payload.create({
        collection: 'subscribers',
        data: { email, ...confirmed },
        // scope: a new entry for the account's own verified email, linked to its own record
        overrideAccess: true,
        req,
      })
  if (existing?.status !== 'confirmed') {
    await emitAutomationEvent(req, { name: 'newsletter.confirmed', subscriberId: entry.id })
  }
}

/**
 * `GiveConsent`: one of the two marketing consents, on the account's own record, under the
 * notice in force, which must be the one the page showed. Refused as `closed-here` on a preview
 * and wherever My IIIC does not offer it (no notice in force, a record under 18, no verified
 * detail for it, WhatsApp not set up), since the contract names no other code for that.
 */
export const giveConsent: GiveConsent = async (req, account, input, now) => {
  if (!actsHere(env().VERCEL_ENV)) return err({ code: 'closed-here' })
  // A form that did not carry the notice it showed is answered as a changed notice: drawn again.
  const parsed = giveConsentInput.safeParse(input)
  if (!parsed.success) return err({ code: 'notice-changed' })
  const { purpose, noticeVersionId } = parsed.data
  const notice = await currentNotice(req.payload, purpose, LANGUAGE, now)
  if (!notice) return err({ code: 'closed-here' })
  if (notice.id !== noticeVersionId) return err({ code: 'notice-changed' })

  const ids = await ownPersonIds(req, account)
  return inTransaction(req, async () => {
    if (standingOf(await ledgerOf(req, ids), purpose).state === 'granted') {
      return err({ code: 'already-given' as const })
    }
    const facts = await offerFacts(req, account, ids, {
      [purpose]: { id: notice.id, text: notice.text },
    })
    if (!mayOffer(purpose, facts)) return err({ code: 'closed-here' as const })
    // The consent first (CLAUDE.md #4). The ledger takes the purpose and the language from the
    // notice (completeEntry in src/collections/Consents.ts).
    const grant = {
      person: account.personId,
      noticeVersion: notice.id,
      channel: 'web',
      grantedAt: now.toISOString(),
      evidence: evidenceOf(req),
    }
    const consent = await req.payload.create({
      collection: 'consents',
      data: grant as unknown as RequiredDataFromCollectionSlug<'consents'>,
      // scope: a consent on the account's own record (account.personId), and no other
      overrideAccess: true,
      req,
    })
    if (purpose === 'marketingEmail' && account.verified.email) {
      await joinTheJournal(
        req,
        {
          email: account.verified.email,
          personId: account.personId,
          consentId: consent.id,
          noticeId: notice.id,
        },
        now,
      )
    }
    return ok({ consentId: consent.id })
  })
}

/**
 * `WithdrawConsent`: every consent of the purpose in force on any of the account's records, one
 * withdrawal each, in one transaction, channel web, with this page's evidence. The account
 * consent is not withdrawn here: closing the account ends it (D-113), so it answers as nothing
 * withdrawable, and so does a purpose the ledger does not know.
 */
export const withdrawConsent: WithdrawConsent = async (req, account, input, now) => {
  if (!actsHere(env().VERCEL_ENV)) return err({ code: 'closed-here' })
  const purpose = input.purpose
  if (!isConsentPurpose(purpose) || endedByClosing(purpose)) {
    return err({ code: 'none-in-force' })
  }
  const ids = await ownPersonIds(req, account)
  const evidence = evidenceOf(req)
  const withdrawn = await inTransaction(req, async () => {
    let count = 0
    for (const personId of ids) {
      count += await withdrawPurpose(req, { personId, purpose, channel: 'web', evidence }, now)
    }
    return count
  })
  return withdrawn > 0 ? ok({ withdrawn }) : err({ code: 'none-in-force' })
}
