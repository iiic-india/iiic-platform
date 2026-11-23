import 'server-only'

import type { PayloadRequest } from 'payload'

import type { ConsentPurpose } from '@/lib/privacy/purposes'
import { DEFAULT_LANGUAGE } from '@/lib/site/languages'

import type { ConsentText } from './catalogue'
import type { Details } from './details'

/**
 * The person a booking is for, and their consents, written in the booking's own transaction
 * (CLAUDE.md #4; docs/08 §3): the consents are the first thing recorded about the person, with
 * the notice each was given under, the time and the evidence the server holds (the form, the
 * address it came from and the browser), and the booking follows in the same transaction, so a
 * booking that fails stores none of it. A new record each time: the details are not verified
 * yet, so the office merges records that turn out to be one person (docs/05, People).
 *
 * A parent or guardian booking for someone under 18 books in their own name; nothing about the
 * child is stored until guardian verification exists (docs/16 §10).
 */

const SERVER = { overrideAccess: true, depth: 0 } as const

export type Evidence = { form: string; ip: string | null; userAgent: string | null }

export async function recordPersonAndConsents(
  req: PayloadRequest,
  input: {
    details: Details
    given: readonly ConsentPurpose[]
    texts: readonly ConsentText[]
    evidence: Evidence
    source: string
    now: Date
  },
): Promise<{ personId: number; consentIds: number[] }> {
  const person = await req.payload.create({
    collection: 'people',
    data: {
      fullName: input.details.fullName,
      mobile: input.details.mobile,
      email: input.details.email,
      language: DEFAULT_LANGUAGE,
      source: input.source,
    },
    req,
    ...SERVER,
  })
  const consentIds: number[] = []
  for (const purpose of input.given) {
    const text = input.texts.find((entry) => entry.purpose === purpose)
    // The flow offers a box only for a purpose whose text is in force.
    if (!text) throw new Error(`No consent text in force for ${purpose}.`)
    const consent = await req.payload.create({
      collection: 'consents',
      data: {
        person: person.id,
        noticeVersion: text.versionId,
        purpose,
        language: DEFAULT_LANGUAGE,
        grantedAt: input.now.toISOString(),
        grantedAt_tz: 'Asia/Kolkata',
        channel: 'web',
        evidence: {
          form: input.evidence.form,
          ip: input.evidence.ip ?? undefined,
          userAgent: input.evidence.userAgent?.slice(0, 500) ?? undefined,
        },
      },
      req,
      ...SERVER,
    })
    consentIds.push(consent.id)
  }
  return { personId: person.id, consentIds }
}
