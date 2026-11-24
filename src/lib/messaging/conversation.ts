import 'server-only'

import type { PayloadRequest } from 'payload'

import { IST } from '@/lib/time/ist'

import { suppress } from './suppress'
import type { WhatsAppNotice } from './webhooks'
import { withdrawPurpose } from './withdrawals'

/**
 * A message a person sent on WhatsApp (docs/13 §7; docs/19 §4): it opens the 24-hour window, so
 * the person's `whatsappLastInboundAt` moves to its time (found by the E.164 mobile); a plain stop
 * suppresses WhatsApp for that number and withdraws `marketingWhatsapp` wherever it is in force,
 * the same day, with the provider's message id as the evidence. Booking messages then go by email.
 * The text itself is never stored or logged.
 */
export async function recordInbound(
  req: PayloadRequest,
  notice: Extract<WhatsAppNotice, { kind: 'inbound' }>,
  providerMessageId: string,
): Promise<{ personId: number | null; suppressed: boolean; withdrawn: number }> {
  const { docs } = await req.payload.find({
    collection: 'people',
    where: { mobile: { equals: notice.from } },
    limit: 1,
    depth: 0,
    select: { whatsappLastInboundAt: true },
    overrideAccess: true,
    req,
  })
  const person = docs[0] ?? null
  if (person) {
    const last = person.whatsappLastInboundAt ? new Date(person.whatsappLastInboundAt) : null
    if (!last || last.getTime() < notice.at.getTime()) {
      await req.payload.update({
        collection: 'people',
        id: person.id,
        data: { whatsappLastInboundAt: notice.at.toISOString(), whatsappLastInboundAt_tz: IST },
        overrideAccess: true,
        req,
      })
    }
  }
  if (!notice.stop) return { personId: person?.id ?? null, suppressed: false, withdrawn: 0 }
  // The withdrawal goes in the ledger first (CLAUDE.md #4), then the number is suppressed.
  const withdrawn = person
    ? await withdrawPurpose(req, {
        personId: person.id,
        purpose: 'marketingWhatsapp',
        channel: 'whatsapp',
        evidence: { form: 'WhatsApp stop request', reference: providerMessageId },
      })
    : []
  const { created } = await suppress(req, {
    channel: 'whatsapp',
    address: notice.from,
    reason: 'whatsappStop',
    source: 'whatsapp',
    ...(person ? { personId: person.id } : {}),
  })
  return { personId: person?.id ?? null, suppressed: created, withdrawn: withdrawn.length }
}
