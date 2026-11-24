import 'server-only'

import type { PayloadRequest, Where } from 'payload'

import { hasRole, type MaybeStaff, type Role } from '@/access/roles'
import { toE164 } from '@/lib/phone'
import { err, ok, type Result } from '@/lib/result'

import { searchQuery, type SearchHit, type ViewError } from './contract'
import { asUser, refused } from './shared'

/**
 * Global search (docs/05, Navigation; docs/18 §7): people, bookings, invoices, certificates,
 * organisations and leads, five of each, each kind only for the roles that read it and every read
 * with the user's own access, so a practitioner finds their own bookings only. Never session
 * notes, Map answers, message bodies, review texts or feedback comments. Asks
 * `viewRefusal(user, 'search')` first. No query is logged or stored.
 */

/** How many hits of each kind. */
export const PER_KIND = 5

/** Who may find each kind (docs/18 §7), before the collections' own rules narrow it again. */
export const SEARCH_KINDS: Record<SearchHit['kind'], readonly Role[]> = {
  person: ['owner', 'operator'],
  booking: ['owner', 'operator', 'practitioner'],
  invoice: ['owner', 'finance'],
  certificate: ['owner', 'operator'],
  organisation: ['owner', 'operator'],
  lead: ['owner', 'operator'],
}

/** A query as typed, and the forms it is matched in: a phone in E.164, an email in small letters. */
export function normaliseQuery(q: string): {
  text: string
  phone: string | null
  email: string | null
} {
  const text = q.trim()
  const phone = /^[+\d][\d\s().-]{6,}$/.test(text) ? toE164(text) : null
  const email = text.includes('@') ? text.toLowerCase() : null
  return { text, phone, email }
}

/** The kinds a user may search, in the order they are shown. */
export function kindsFor(user: unknown): SearchHit['kind'][] {
  return (Object.keys(SEARCH_KINDS) as SearchHit['kind'][]).filter((kind) =>
    hasRole(user as MaybeStaff, ...SEARCH_KINDS[kind]),
  )
}

export async function searchAdmin(
  req: PayloadRequest,
  query: unknown,
): Promise<Result<SearchHit[], ViewError>> {
  const refusal = refused(req, 'search')
  if (refusal) return refusal
  const parsed = searchQuery.safeParse(query)
  if (!parsed.success) {
    return err({ code: 'invalid', issues: parsed.error.issues.map((issue) => issue.message) })
  }
  const { text, phone, email } = normaliseQuery(parsed.data.q)
  const admin = req.payload.config.routes.admin
  const user = asUser(req)
  const common = { limit: PER_KIND, depth: 0, ...user } as const
  const hits: SearchHit[] = []

  for (const kind of kindsFor(req.user)) {
    switch (kind) {
      case 'person': {
        const or: Where[] = [{ fullName: { like: text } }]
        if (phone) or.push({ mobile: { equals: phone } })
        if (email) or.push({ email: { equals: email } })
        const { docs } = await req.payload.find({
          collection: 'people',
          where: { or },
          select: { fullName: true, email: true, mobile: true },
          ...common,
        })
        for (const doc of docs) {
          hits.push({
            kind,
            id: doc.id,
            label: doc.fullName,
            detail: doc.email ?? doc.mobile ?? '',
            href: `${admin}/people/${doc.id}`,
          })
        }
        break
      }
      case 'booking': {
        const { docs } = await req.payload.find({
          collection: 'bookings',
          where: { reference: { like: text.toUpperCase() } },
          select: { reference: true, status: true, startsAt: true },
          ...common,
        })
        for (const doc of docs) {
          hits.push({
            kind,
            id: doc.id,
            label: doc.reference,
            detail: doc.status,
            href: `${admin}/collections/bookings/${doc.id}`,
          })
        }
        break
      }
      case 'invoice': {
        const { docs } = await req.payload.find({
          collection: 'invoices',
          where: { number: { like: text } },
          select: { number: true, status: true },
          ...common,
        })
        for (const doc of docs) {
          hits.push({
            kind,
            id: doc.id,
            label: doc.number ?? String(doc.id),
            detail: doc.status,
            href: `${admin}/collections/invoices/${doc.id}`,
          })
        }
        break
      }
      case 'certificate': {
        const { docs } = await req.payload.find({
          collection: 'certificates',
          where: { certificateId: { like: text.toUpperCase() } },
          select: { certificateId: true, status: true },
          ...common,
        })
        for (const doc of docs) {
          hits.push({
            kind,
            id: doc.id,
            label: doc.certificateId,
            detail: doc.status,
            href: `${admin}/certificates/issue?certificate=${encodeURIComponent(doc.certificateId)}`,
          })
        }
        break
      }
      case 'organisation': {
        const { docs } = await req.payload.find({
          collection: 'organisations',
          where: { name: { like: text } },
          select: { name: true, city: true },
          ...common,
        })
        for (const doc of docs) {
          hits.push({
            kind,
            id: doc.id,
            label: doc.name,
            detail: doc.city ?? '',
            href: `${admin}/collections/organisations/${doc.id}`,
          })
        }
        break
      }
      case 'lead': {
        const { docs } = await req.payload.find({
          collection: 'leads',
          where: { title: { like: text } },
          select: { title: true, stage: true },
          ...common,
        })
        for (const doc of docs) {
          hits.push({
            kind,
            id: doc.id,
            label: doc.title ?? String(doc.id),
            detail: doc.stage,
            href: `${admin}/collections/leads/${doc.id}`,
          })
        }
        break
      }
    }
  }
  return ok(hits)
}
