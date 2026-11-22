import 'server-only'

import type { PayloadRequest } from 'payload'

import { optionOf } from '@/lib/booking/load'
import { quotePrice } from '@/lib/payments/prices'
import type { ConsentPurpose } from '@/lib/privacy/purposes'
import type { Flags } from '@/lib/settings/flags'
import { readFlags } from '@/lib/settings/source'
import { DEFAULT_LANGUAGE } from '@/lib/site/languages'

import { consentsOffered, type FlowType } from './details'
import { reviewFor, type Quote } from './review'

/**
 * What the booking flow's first steps show (docs/03 F3, steps 1 and 3), read on the server past
 * the collections' access rules, and only what a visitor may see: offered services of the kind
 * being booked with their lengths and formats, the active practitioners who offer each (by the
 * name they publish), the info sessions ahead, and the consent texts in force. A price is drawn
 * only while prices are published (D-21), as the server computed it, for a session.
 */

const SERVER = { overrideAccess: true, depth: 0 } as const

export type FlowOption = {
  id: string
  label: string | null
  minutes: number
  /** Only while prices are published, for a session with a price set. */
  total: Quote | null
}

export type FlowService = {
  id: number
  name: string
  format: 'online' | 'office' | 'both'
  options: FlowOption[]
  practitioners: { id: number; name: string }[]
}

export type FlowEvent = {
  id: number
  title: string
  startsAt: string
  endsAt: string
  format: 'online' | 'office'
  full: boolean
}

export type ConsentText = { purpose: ConsentPurpose; versionId: number; text: string }

export type FlowCatalogue = {
  type: FlowType
  flags: Pick<Flags, 'pricesPublic' | 'payAtBooking'>
  services: FlowService[]
  events: FlowEvent[]
  consents: ConsentText[]
}

/** The consent texts in force now for each purpose, in the default language (docs/08 §3). */
export async function consentTextsInForce(
  req: PayloadRequest,
  purposes: readonly ConsentPurpose[],
  now: Date,
): Promise<ConsentText[]> {
  const texts: ConsentText[] = []
  for (const purpose of purposes) {
    const { docs } = await req.payload.find({
      collection: 'consent-versions',
      where: {
        and: [
          { purpose: { equals: purpose } },
          { language: { equals: DEFAULT_LANGUAGE } },
          { effectiveFrom: { less_than_equal: now.toISOString() } },
        ],
      },
      sort: '-effectiveFrom',
      limit: 1,
      req,
      ...SERVER,
    })
    const version = docs[0]
    if (version) texts.push({ purpose, versionId: version.id, text: version.text })
  }
  return texts
}

/** The price a visitor may see for an option: a session's, while prices are published. */
async function visibleTotal(
  req: PayloadRequest,
  input: { type: FlowType; flags: FlowCatalogue['flags']; serviceId: number; optionId: string },
  now: Date,
): Promise<Quote | null> {
  if (!input.flags.pricesPublic || input.type !== 'session') return null
  const quote = await quotePrice(req, {
    serviceId: input.serviceId,
    serviceOption: input.optionId,
    at: now,
  })
  if (!quote.ok) return null
  const { totalPaise, taxPaise, taxablePaise, rate } = quote.value
  return reviewFor({ type: input.type, flags: input.flags, quote: quote.value }).total
    ? { totalPaise, taxPaise, taxablePaise, rate }
    : null
}

export async function loadCatalogue(
  req: PayloadRequest,
  type: FlowType,
  now: Date = new Date(),
): Promise<FlowCatalogue> {
  const allFlags = await readFlags(req.payload)
  const flags = { pricesPublic: allFlags.pricesPublic, payAtBooking: allFlags.payAtBooking }
  const consents = await consentTextsInForce(req, consentsOffered(type, null), now)

  if (type === 'info') {
    const { docs } = await req.payload.find({
      collection: 'events',
      where: {
        and: [
          { kind: { equals: 'infoSession' } },
          { active: { equals: true } },
          { startsAt: { greater_than: now.toISOString() } },
          { service: { exists: true } },
        ],
      },
      sort: 'startsAt',
      limit: 20,
      req,
      ...SERVER,
    })
    const events: FlowEvent[] = []
    for (const event of docs) {
      const { totalDocs } = await req.payload.count({
        collection: 'bookings',
        where: { and: [{ event: { equals: event.id } }, { status: { equals: 'confirmed' } }] },
        req,
        overrideAccess: true,
      })
      events.push({
        id: event.id,
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        format: event.format,
        full: typeof event.capacity === 'number' && totalDocs >= event.capacity,
      })
    }
    return { type, flags, services: [], events, consents }
  }

  const { docs: services } = await req.payload.find({
    collection: 'services',
    where: { and: [{ type: { equals: type } }, { active: { equals: true } }] },
    sort: 'name',
    pagination: false,
    req,
    ...SERVER,
  })
  const { docs: practitioners } = await req.payload.find({
    collection: 'practitioners',
    where: { active: { equals: true } },
    sort: 'publicName',
    pagination: false,
    req,
    ...SERVER,
  })
  const flowServices: FlowService[] = []
  for (const service of services) {
    const options: FlowOption[] = []
    for (const option of service.options ?? []) {
      const usable = option.id ? optionOf(service, option.id) : null
      if (!usable) continue
      options.push({
        id: usable.id,
        label: usable.label,
        minutes: usable.durationMinutes,
        total: await visibleTotal(
          req,
          { type, flags, serviceId: service.id, optionId: usable.id },
          now,
        ),
      })
    }
    const offering = practitioners
      .filter((practitioner) =>
        (practitioner.services ?? []).some(
          (entry) => (typeof entry === 'number' ? entry : entry.id) === service.id,
        ),
      )
      .map((practitioner) => ({ id: practitioner.id, name: practitioner.publicName }))
    if (options.length && offering.length) {
      flowServices.push({
        id: service.id,
        name: service.name,
        format: service.format,
        options,
        practitioners: offering,
      })
    }
  }
  return { type, flags, services: flowServices, events: [], consents }
}
