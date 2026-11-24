import 'server-only'

import type { PayloadRequest, RequiredDataFromCollectionSlug } from 'payload'

import { IST } from '@/lib/time/ist'

import type { Suppress } from './operations'
import type { Channel } from './types'

/**
 * The suppression list (docs/13 §6, §7; docs/19 §3, §4): one entry per channel and address, made
 * by a provider's webhook (a hard bounce, a complaint, a STOP) or by the office; checked before
 * every send. The collection's own hook raises `message.suppressed` when an entry is made, so O9
 * and N3 run however it was added (src/collections/Suppressions.ts).
 */

/** An address as the list keeps it: an email in small letters, a mobile as given (E.164). */
export function normaliseAddress(address: string): string {
  return address.trim().toLowerCase()
}

export async function isSuppressed(
  req: PayloadRequest,
  channel: Channel,
  address: string,
): Promise<boolean> {
  const { totalDocs } = await req.payload.count({
    collection: 'suppressions',
    where: {
      and: [{ channel: { equals: channel } }, { address: { equals: normaliseAddress(address) } }],
    },
    overrideAccess: true,
    req,
  })
  return totalDocs > 0
}

async function existing(req: PayloadRequest, channel: Channel, address: string) {
  const { docs } = await req.payload.find({
    collection: 'suppressions',
    where: { and: [{ channel: { equals: channel } }, { address: { equals: address } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return docs[0] ?? null
}

/** Adds the address once; a second report about it returns the first entry. */
export const suppress: Suppress = async (req, entry) => {
  const address = normaliseAddress(entry.address)
  const found = await existing(req, entry.channel, address)
  if (found) return { suppressionId: found.id, created: false }
  try {
    const data: RequiredDataFromCollectionSlug<'suppressions'> = {
      channel: entry.channel,
      address,
      reason: entry.reason,
      source: entry.source,
      at: new Date().toISOString(),
      at_tz: IST,
      person: entry.personId ?? null,
    }
    const made = await req.payload.create({
      collection: 'suppressions',
      data,
      overrideAccess: true,
      req,
    })
    return { suppressionId: made.id, created: true }
  } catch (error) {
    // Two reports at once: the unique (channel, address) index kept one; return it. Inside a
    // caller's transaction the statement has aborted it, so the caller's retry finds the entry.
    const again = await existing(req, entry.channel, address).catch(() => null)
    if (again) return { suppressionId: again.id, created: false }
    throw error
  }
}
