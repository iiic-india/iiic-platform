import 'server-only'

import type { PayloadRequest } from 'payload'

import { idOf } from '@/lib/privacy/consentLedger'

import type { Channel, Recipient } from './types'

/**
 * Who a message goes to, read when it is sent (docs/19 §3): the address is never copied into the
 * message's row, so a corrected address is used and an erased person is not written to. A person
 * has an email and a mobile; a newsletter subscriber an email (and a person once confirmed); a
 * staff account its email while it is active. Nothing here is logged.
 */
export type RecipientFacts = {
  /** The address on the channel, or null when there is none. */
  address: string | null
  /** The person behind the recipient, for the consent ledger and the withdraw link. */
  personId: number | null
  /** The subscriber behind it, for the unsubscribe link. */
  subscriberId: number | null
  under18: boolean
  language: string
  /** WhatsApp: when the person last wrote, which opens the 24-hour window. */
  lastInboundAt: Date | null
}

/** No one to write to: the recipient is gone, or was never there. */
export const NO_RECIPIENT: RecipientFacts = {
  address: null,
  personId: null,
  subscriberId: null,
  under18: false,
  language: 'en',
  lastInboundAt: null,
}

const asDate = (value: unknown): Date | null => {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null

async function person(req: PayloadRequest, id: number, channel: Channel): Promise<RecipientFacts> {
  const found = await req.payload.findByID({
    collection: 'people',
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    select: {
      email: true,
      mobile: true,
      ageBand: true,
      language: true,
      whatsappLastInboundAt: true,
    },
    req,
  })
  if (!found) return NO_RECIPIENT
  const record = found as Record<string, unknown>
  return {
    address: channel === 'email' ? text(record.email) : text(record.mobile),
    personId: id,
    subscriberId: null,
    under18: record.ageBand === 'under18',
    language: text(record.language) ?? 'en',
    lastInboundAt: asDate(record.whatsappLastInboundAt),
  }
}

/**
 * A sign-in code's address (A1; docs/20 §4.3): only what the first try was handed, never a stored
 * one. An email in small letters, a mobile in E.164; anything else, or nothing (a retry, the
 * dispatcher), is no address, so the message is skipped as `no-address` and nothing goes twice.
 * Pure: it reads no record.
 */
export function signInFacts(
  channel: Channel,
  transient: Readonly<Record<string, string>> | undefined,
): RecipientFacts {
  const raw = text(transient?.address)
  const address =
    raw === null
      ? null
      : channel === 'email'
        ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)
          ? raw.toLowerCase()
          : null
        : /^\+[1-9]\d{7,14}$/.test(raw)
          ? raw
          : null
  return { ...NO_RECIPIENT, address }
}

export async function recipientFacts(
  req: PayloadRequest,
  recipient: Recipient,
  channel: Channel,
  transient?: Readonly<Record<string, string>>,
): Promise<RecipientFacts> {
  if (recipient.kind === 'signIn') return signInFacts(channel, transient)
  if (recipient.kind === 'person') return person(req, recipient.id, channel)
  if (recipient.kind === 'subscriber') {
    const found = await req.payload.findByID({
      collection: 'subscribers',
      id: recipient.id,
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
      select: { email: true, person: true, status: true },
      req,
    })
    if (!found) return NO_RECIPIENT
    const personId = idOf((found as Record<string, unknown>).person)
    const linked = personId === null ? null : await person(req, Number(personId), channel)
    return {
      ...(linked ?? NO_RECIPIENT),
      // A subscriber is written to at the address they signed up with, on email only.
      address: channel === 'email' ? text(found.email) : null,
      personId: personId === null ? null : Number(personId),
      subscriberId: recipient.id,
      // Gone from the list: nothing more goes to them.
      ...(found.status === 'unsubscribed' ? { address: null } : {}),
    }
  }
  const staff = await req.payload.findByID({
    collection: 'users',
    id: recipient.id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    select: { email: true, active: true },
    req,
  })
  if (!staff || (staff as Record<string, unknown>).active === false) return NO_RECIPIENT
  return { ...NO_RECIPIENT, address: channel === 'email' ? text(staff.email) : null }
}

/** Whether the person wrote on WhatsApp within the last 24 hours (docs/13 §7). */
export function windowOpen(lastInboundAt: Date | null, now: Date): boolean {
  return lastInboundAt !== null && now.getTime() - lastInboundAt.getTime() < 24 * 3_600_000
}
