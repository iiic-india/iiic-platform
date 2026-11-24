import 'server-only'

import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import { viewRefusal } from '@/access/views'
import { err, ok, type Result } from '@/lib/result'

import type { CertificateError } from './contract'

/**
 * Who the issue screen can add (docs/18 §4): people found by name, or everyone booked on an event.
 * Checked first like every act of the screen, then read with the user's own access; only the id
 * and the full name leave the server, never a contact detail.
 */

export type Recipient = { personId: number; fullName: string }

/** At most this many people answer a name search. */
export const SEARCH_LIMIT = 10

/** A booking whose person was due to attend or did: not requested, held, cancelled or a no-show. */
const BOOKED = ['confirmed', 'completed'] as const

export const recipientQuery = z.union([
  z.object({ q: z.string().trim().min(2).max(100) }),
  z.object({ event: z.coerce.number().int().positive() }),
])

export async function findRecipients(
  req: PayloadRequest,
  query: unknown,
): Promise<Result<Recipient[], CertificateError>> {
  const refusal = viewRefusal(req.user, 'certificatesIssue')
  if (refusal) return err({ code: 'refused', refusal })
  const parsed = recipientQuery.safeParse(query)
  if (!parsed.success) return err({ code: 'invalid', issues: ['Type two letters or more.'] })

  if ('q' in parsed.data) {
    const { docs } = await req.payload.find({
      collection: 'people',
      where: { fullName: { like: parsed.data.q } },
      select: { fullName: true },
      sort: 'fullName',
      limit: SEARCH_LIMIT,
      depth: 0,
      overrideAccess: false,
      req,
    })
    return ok(docs.map((doc) => ({ personId: doc.id, fullName: doc.fullName })))
  }

  const { docs } = await req.payload.find({
    collection: 'bookings',
    where: {
      and: [{ event: { equals: parsed.data.event } }, { status: { in: [...BOOKED] } }],
    },
    select: { person: true },
    pagination: false,
    depth: 1,
    populate: { people: { fullName: true } },
    overrideAccess: false,
    req,
  })
  const people = new Map<number, string>()
  for (const { person } of docs) {
    if (person && typeof person === 'object') people.set(person.id, person.fullName)
  }
  return ok(
    [...people]
      .map(([personId, fullName]) => ({ personId, fullName }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'en-IN')),
  )
}
