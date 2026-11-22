import type { CollectionAfterChangeHook, PayloadRequest } from 'payload'

import { err, type Result } from '@/lib/result'
import type { PriceHistory, Service } from '@/payload-types'

import type { PriceQuote } from './money'
import { quoteFromPrice, type QuoteError } from './tax'

/**
 * Prices in force (docs/16 §5; docs/04 `price_history`; docs/08 §4). A service's options hold the
 * all-in price in paise and the GST flag, the service its GST rate and SAC code (I-28, I-29). When
 * an owner saves a service, the server closes the open price-history row of every option whose
 * price, GST flag, rate, label or length changed and opens a new one, so the open row is always
 * the price in force and a past price can be shown when the law asks (the lowest of 30 days,
 * from 1 January 2027). The booking flow quotes from that row, on the server.
 *
 * The services collection's hook uses this module, so it stays free of `server-only`: the
 * Payload CLI loads it too (src/lib/env.ts says why). Nothing here is shown to a visitor; a
 * quote is drawn only while prices_public is on (D-21), which the flow checks.
 */

const SERVER = { overrideAccess: true, depth: 0 } as const

type OptionRow = NonNullable<Service['options']>[number]

/** The terms one price row records for one option. */
type Terms = Pick<
  PriceHistory,
  'pricePaise' | 'gstInclusive' | 'gstRateBasisPoints' | 'optionLabel' | 'durationMinutes'
>

function termsOf(option: OptionRow, rate: number | null | undefined): Terms | null {
  if (typeof option.price !== 'number') return null
  return {
    pricePaise: option.price,
    // The services collection's own default: prices are all-in (docs/04).
    gstInclusive: option.gstInclusive ?? true,
    gstRateBasisPoints: rate ?? null,
    optionLabel: option.label ?? null,
    durationMinutes: option.duration ?? null,
  }
}

function sameTerms(row: PriceHistory, terms: Terms): boolean {
  return (
    row.pricePaise === terms.pricePaise &&
    (row.gstInclusive ?? true) === terms.gstInclusive &&
    (row.gstRateBasisPoints ?? null) === terms.gstRateBasisPoints &&
    (row.optionLabel ?? null) === terms.optionLabel &&
    (row.durationMinutes ?? null) === terms.durationMinutes
  )
}

async function openRows(req: PayloadRequest, serviceId: number): Promise<PriceHistory[]> {
  const { docs } = await req.payload.find({
    collection: 'price-history',
    where: { and: [{ service: { equals: serviceId } }, { validTo: { exists: false } }] },
    pagination: false,
    req,
    ...SERVER,
  })
  return docs
}

/**
 * Brings the price history in line with a saved service, in the save's transaction. Returns how
 * many rows it opened. Idempotent: saving an unchanged service changes nothing.
 */
export async function recordPriceHistory(
  req: PayloadRequest,
  service: Pick<Service, 'id' | 'options' | 'gstRateBasisPoints'>,
  now: Date,
): Promise<number> {
  const open = await openRows(req, service.id)
  const close = (row: PriceHistory) =>
    req.payload.update({
      collection: 'price-history',
      id: row.id,
      data: { validTo: now.toISOString() },
      req,
      ...SERVER,
    })
  const seen = new Set<string>()
  let opened = 0
  for (const option of service.options ?? []) {
    if (!option.id) continue
    seen.add(option.id)
    const current = open.filter((row) => row.serviceOption === option.id)
    const terms = termsOf(option, service.gstRateBasisPoints)
    if (terms && current.length === 1 && sameTerms(current[0] as PriceHistory, terms)) continue
    for (const row of current) await close(row)
    if (!terms) continue
    await req.payload.create({
      collection: 'price-history',
      data: {
        service: service.id,
        serviceOption: option.id,
        validFrom: now.toISOString(),
        validFrom_tz: 'Asia/Kolkata',
        ...terms,
      },
      req,
      ...SERVER,
    })
    opened += 1
  }
  // An option removed from the service has no price any more.
  for (const row of open) if (!seen.has(row.serviceOption)) await close(row)
  return opened
}

/** The services collection's hook: the price history follows every save (docs/16 §5). */
export const recordPriceHistoryAfterChange: CollectionAfterChangeHook<Service> = async ({
  doc,
  req,
}) => {
  await recordPriceHistory(req, doc, new Date())
  return doc
}

/** The price row in force for one option at one instant: from on or before it, until after it. */
export async function priceInForce(
  req: PayloadRequest,
  input: { serviceId: number; serviceOption: string; at: Date },
): Promise<PriceHistory | null> {
  const at = input.at.toISOString()
  const { docs } = await req.payload.find({
    collection: 'price-history',
    where: {
      and: [
        { service: { equals: input.serviceId } },
        { serviceOption: { equals: input.serviceOption } },
        { validFrom: { less_than_equal: at } },
        { or: [{ validTo: { exists: false } }, { validTo: { greater_than: at } }] },
      ],
    },
    sort: '-validFrom',
    limit: 1,
    pagination: false,
    req,
    ...SERVER,
  })
  return docs[0] ?? null
}

export type PriceError = QuoteError | { code: 'no-price' } | { code: 'not-found' }

/**
 * What a booking of one option costs now, from the price in force and the service's SAC code
 * (docs/16 §5): the booking flow copies it into the booking at step 3 (price.totalPaise, taxPaise,
 * gstRateBasisPoints, sacCode), and that total never grows (docs/08 §5). `no-price` while IIIC has
 * set no price for the option (I-28): the flow then takes no payment at booking (docs/16 §8).
 */
export async function quotePrice(
  req: PayloadRequest,
  input: { serviceId: number; serviceOption: string; at: Date },
): Promise<Result<PriceQuote, PriceError>> {
  const service = await req.payload.findByID({
    collection: 'services',
    id: input.serviceId,
    disableErrors: true,
    req,
    ...SERVER,
  })
  if (!service) return err({ code: 'not-found' })
  const row = await priceInForce(req, input)
  if (!row) return err({ code: 'no-price' })
  return quoteFromPrice({
    priceHistoryId: row.id,
    pricePaise: row.pricePaise,
    gstInclusive: row.gstInclusive ?? true,
    rate: row.gstRateBasisPoints ?? null,
    sacCode: service.sacCode ?? null,
  })
}
