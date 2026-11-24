import 'server-only'

import type { PayloadRequest, RequiredDataFromCollectionSlug } from 'payload'

import type { Message } from '@/payload-types'

import { inCallersTransaction } from './store'

/**
 * Writing a message's row once (docs/19 §2, layer 2): one row per unique key, and a key already
 * recorded returns that row. Two writers at the same moment meet the unique index; outside a
 * caller's transaction the loser reads the winner's row, inside one the statement has aborted the
 * transaction and the caller's job retries, then finds the row.
 */

export async function findByKey(req: PayloadRequest, dedupeKey: string): Promise<Message | null> {
  const { docs } = await req.payload.find({
    collection: 'messages',
    where: { dedupeKey: { equals: dedupeKey } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return docs[0] ?? null
}

export async function recordRow(
  req: PayloadRequest,
  data: RequiredDataFromCollectionSlug<'messages'>,
): Promise<{ message: Message; created: boolean }> {
  const found = await findByKey(req, data.dedupeKey)
  if (found) return { message: found, created: false }
  try {
    const message = await req.payload.create({
      collection: 'messages',
      data,
      overrideAccess: true,
      req,
    })
    return { message, created: true }
  } catch (error) {
    if (await inCallersTransaction(req)) throw error
    const again = await findByKey(req, data.dedupeKey)
    if (again) return { message: again, created: false }
    throw error
  }
}

export async function messageById(req: PayloadRequest, id: number): Promise<Message | null> {
  return req.payload.findByID({
    collection: 'messages',
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
}
