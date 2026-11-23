import 'server-only'

import type { PayloadRequest, RequiredDataFromCollectionSlug } from 'payload'

import { emitAutomationEvent } from '@/lib/automations/emit'
import { env } from '@/lib/env'
import { inTransaction } from '@/lib/payments/store'
import { idOf } from '@/lib/privacy/consentLedger'
import { consentFor, currentNotice } from '@/lib/privacy/consents'
import { err, ok, type Result } from '@/lib/result'
import type { Subscriber } from '@/payload-types'

import { linkLive, signupAction, type SignupAction } from './rules'
import {
  CONFIRM_DAYS,
  confirmationKey,
  confirmationToken,
  confirmExpiry,
  hashToken,
  isToken,
} from './tokens'

/**
 * The newsletter's double opt-in, on the server (docs/19 §8; D-10; CLAUDE.md #4). A signup keeps
 * only what is needed to send the confirmation: the address, the notice the form showed and the
 * hash of the link's token, for 7 days. Nothing promotional is stored and nobody is added to
 * `people` until the person confirms; then, in one transaction, the person is found or added by
 * email, the consent to marketing email is recorded under the notice they saw (channel web, with
 * the form, the address and the browser as evidence), and only then is the entry confirmed. If
 * the consent cannot be recorded, nothing of the confirmation is kept. Unsubscribing records the
 * withdrawal and marks the entry, at once.
 */

const LANGUAGE = 'en-IN'
const FORM = 'Newsletter signup (Journal)'

export type SignupError = { code: 'not-open' }

/** A signup: the same answer whether or not the address is known (the route says so). */
export async function signUp(
  req: PayloadRequest,
  input: { email: string; source?: string },
  now: Date,
): Promise<Result<{ action: SignupAction }, SignupError>> {
  // The form asks only while a notice for marketing email is in force.
  const notice = await currentNotice(req.payload, 'marketingEmail', LANGUAGE, now)
  if (!notice) return err({ code: 'not-open' })

  return inTransaction(req, async () => {
    const existing = await findByEmail(req, input.email)
    const action = signupAction(
      existing ? { status: existing.status, confirmExpiresAt: existing.confirmExpiresAt } : null,
      now,
      CONFIRM_DAYS,
    )
    if (action === 'none') return ok({ action })

    const expiresAt = confirmExpiry(now)
    const pending = {
      status: 'pending' as const,
      notice: notice.id,
      confirmExpiresAt: expiresAt.toISOString(),
      ...(input.source ? { source: input.source } : {}),
    }
    const entry = existing
      ? await req.payload.update({
          collection: 'subscribers',
          id: existing.id,
          data: pending,
          overrideAccess: true,
          req,
        })
      : await req.payload.create({
          collection: 'subscribers',
          data: { email: input.email, ...pending },
          overrideAccess: true,
          req,
        })
    // The hash depends on the id, so it is written once the entry has one.
    const token = confirmationToken(key(), entry.id, expiresAt)
    await req.payload.update({
      collection: 'subscribers',
      id: entry.id,
      data: { confirmTokenHash: hashToken(token) },
      overrideAccess: true,
      req,
    })
    await emitAutomationEvent(req, { name: 'newsletter.signedUp', subscriberId: entry.id })
    return ok({ action })
  })
}

export type ConfirmError = { code: 'invalid' } | { code: 'expired' }

/** Evidence a form on the site records with a consent (docs/08 §3). */
export type FormEvidence = { ip: string; userAgent: string }

/** A pending entry by its link, without changing anything (the page before the button). */
export async function findByToken(req: PayloadRequest, token: string): Promise<Subscriber | null> {
  if (!isToken(token)) return null
  const { docs } = await req.payload.find({
    collection: 'subscribers',
    where: { confirmTokenHash: { equals: hashToken(token) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return docs[0] ?? null
}

/**
 * Confirms a signup, on the POST of the confirmation page's button (a link scanner that only
 * opens the link confirms nothing). Confirming twice is harmless.
 */
export async function confirmSignup(
  req: PayloadRequest,
  token: string,
  evidence: FormEvidence,
  now: Date,
): Promise<Result<{ subscriberId: number; already: boolean }, ConfirmError>> {
  const entry = await findByToken(req, token)
  if (!entry) return err({ code: 'invalid' })
  if (entry.status === 'confirmed') return ok({ subscriberId: entry.id, already: true })
  if (entry.status !== 'pending' || !linkLive(entry.confirmExpiresAt, now)) {
    return err({ code: 'expired' })
  }
  const noticeId = idOf(entry.notice)
  if (noticeId === null) return err({ code: 'invalid' })

  return inTransaction(req, async () => {
    const personId = await findOrAddPerson(req, entry.email, now)
    // The consent first, under the notice the form showed (CLAUDE.md #4). The ledger takes the
    // purpose and the language from the notice (completeEntry in src/collections/Consents.ts).
    const grant = {
      person: personId,
      noticeVersion: Number(noticeId),
      channel: 'web',
      grantedAt: now.toISOString(),
      evidence: {
        form: FORM,
        ip: evidence.ip.slice(0, 500),
        userAgent: evidence.userAgent.slice(0, 500),
      },
    }
    const consent = await req.payload.create({
      collection: 'consents',
      data: grant as unknown as RequiredDataFromCollectionSlug<'consents'>,
      overrideAccess: true,
      req,
    })
    await req.payload.update({
      collection: 'subscribers',
      id: entry.id,
      data: {
        status: 'confirmed',
        person: personId,
        consent: consent.id,
        confirmedAt: now.toISOString(),
        confirmTokenHash: null,
      },
      overrideAccess: true,
      req,
    })
    await emitAutomationEvent(req, { name: 'newsletter.confirmed', subscriberId: entry.id })
    return ok({ subscriberId: entry.id, already: false })
  })
}

/**
 * Takes a subscriber off the list: every consent to marketing email in force is withdrawn (one
 * entry each, channel web or email), and the entry is marked `unsubscribed`. Doing it twice
 * changes nothing. The ledger's hook raises `consent.withdrawn` (N3).
 */
export async function unsubscribe(
  req: PayloadRequest,
  subscriberId: number,
  channel: 'web' | 'email',
  now: Date,
): Promise<Result<{ withdrawn: number }, { code: 'not-found' }>> {
  const entry = await req.payload.findByID({
    collection: 'subscribers',
    id: subscriberId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  if (!entry) return err({ code: 'not-found' })
  return inTransaction(req, async () => {
    const personId = idOf(entry.person)
    const withdrawn =
      personId === null ? 0 : await withdrawMarketingEmail(req, personId, channel, now)
    if (entry.status !== 'unsubscribed') {
      await req.payload.update({
        collection: 'subscribers',
        id: entry.id,
        data: { status: 'unsubscribed', unsubscribedAt: now.toISOString(), confirmTokenHash: null },
        overrideAccess: true,
        req,
      })
    }
    return ok({ withdrawn })
  })
}

/** Withdraws every consent to marketing email a person has in force; returns how many. */
export async function withdrawMarketingEmail(
  req: PayloadRequest,
  personId: number | string,
  channel: 'web' | 'email',
  now: Date,
): Promise<number> {
  if ((await consentFor(req.payload, personId, 'marketingEmail', req)) !== 'granted') return 0
  const { docs } = await req.payload.find({
    collection: 'consents',
    where: {
      and: [
        { person: { equals: personId } },
        { purpose: { equals: 'marketingEmail' } },
        { withdraws: { exists: false } },
      ],
    },
    pagination: false,
    depth: 0,
    select: { purpose: true },
    overrideAccess: true,
    req,
  })
  let count = 0
  for (const grant of docs) {
    const ended = await req.payload.count({
      collection: 'consents',
      where: { withdraws: { equals: grant.id } },
      overrideAccess: true,
      req,
    })
    if (ended.totalDocs > 0) continue
    await req.payload.create({
      collection: 'consents',
      data: {
        withdraws: grant.id,
        channel,
        withdrawnAt: now.toISOString(),
        evidence: { form: 'Newsletter unsubscribe' },
      } as unknown as RequiredDataFromCollectionSlug<'consents'>,
      overrideAccess: true,
      req,
    })
    count += 1
  }
  return count
}

async function findByEmail(req: PayloadRequest, email: string): Promise<Subscriber | null> {
  const { docs } = await req.payload.find({
    collection: 'subscribers',
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return docs[0] ?? null
}

/**
 * The person an address belongs to, or a new record holding only the address (verified by the
 * click) until they give more. The placeholder name says where the record came from.
 */
async function findOrAddPerson(req: PayloadRequest, email: string, now: Date): Promise<number> {
  const { docs } = await req.payload.find({
    collection: 'people',
    where: { email: { equals: email } },
    sort: 'createdAt',
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (docs[0]) return docs[0].id
  const person = await req.payload.create({
    collection: 'people',
    data: {
      fullName: NEWSLETTER_PERSON_NAME,
      email,
      emailVerifiedAt: now.toISOString(),
      language: LANGUAGE,
      source: 'newsletter',
    },
    overrideAccess: true,
    req,
  })
  return person.id
}

/** The name a person added by the newsletter carries until they give theirs (proposed, docs/19 §8). */
export const NEWSLETTER_PERSON_NAME = 'Newsletter subscriber'

let cachedKey: Buffer | null = null

/** The confirmation links' key, derived once from PAYLOAD_SECRET. */
export function key(): Buffer {
  cachedKey ??= confirmationKey(env().PAYLOAD_SECRET)
  return cachedKey
}

/** The confirmation link's token for a pending entry, as N1's email shows it. */
export function tokenFor(entry: Pick<Subscriber, 'id' | 'confirmExpiresAt'>): string | null {
  if (!entry.confirmExpiresAt) return null
  return confirmationToken(key(), entry.id, new Date(entry.confirmExpiresAt))
}
