import 'server-only'

import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import { hasRole, type MaybeStaff } from '@/access/roles'
import { BOOKING_STATUSES, BOOKING_TYPES } from '@/lib/booking/states'
import { countNotesForOwner } from '@/lib/notes/notes'
import { PAYMENT_STATUSES, REFUND_STATUSES, INVOICE_STATUSES } from '@/lib/payments/states'
import { LEAD_STAGES } from '@/lib/pipeline/stages'
import { CONSENT_PURPOSES } from '@/lib/privacy/purposes'
import { REQUEST_STATUSES, REQUEST_TYPES } from '@/lib/privacy/requests'
import { err, ok, type Result } from '@/lib/result'

import type { PersonTimeline, TimelineEntry, ViewError } from './contract'
import { asUser, idOf, isOffice, refused } from './shared'

/**
 * The person record (docs/05, People; docs/18 §6): contact details, the consents in force and one
 * timeline of everything IIIC holds about the person that this role may read: bookings, payments,
 * refunds, invoices, consents, certificates, feedback, reviews, privacy requests, leads and their
 * activities. Asks `viewRefusal(user, 'person')` first; every read is with the user's own access,
 * so a practitioner reaches their own clients only (the name, mobile and email, and the bookings
 * with them), and a person they may not read answers `not-found`, as a missing one does. The
 * timeline names its entries, never their words: no note, comment, message or Map answer. An owner
 * sees how many session notes exist, never what they say.
 */

const personId = z.coerce.number().int().positive()

/** How many of each kind the timeline reads. */
const EACH = 100

const labelOf = (options: readonly { value: string; label: string }[], value: unknown) =>
  options.find((option) => option.value === value)?.label ?? String(value ?? '')

/** The kinds a role does not see on the record, named rather than left out (docs/18 §6). */
export function notShownFor(user: unknown): string[] {
  const staff = user as MaybeStaff
  const waiting = ['Messages (waits on M6)', 'Course enrolments (waits on Release 2)']
  if (isOffice(staff)) {
    return hasRole(staff, 'owner') ? waiting : ['Invoices (owners and finance)', ...waiting]
  }
  return [
    'Payments, refunds and invoices (the office)',
    'Consents, certificates, feedback, reviews and privacy requests (the office)',
    'Leads and their activities (the office)',
    'Bookings with other practitioners',
    ...waiting,
  ]
}

/**
 * The purposes in force now: entries given and not withdrawn, newest first. A withdrawal is an
 * entry of its own that names the one it withdraws (M2's ledger).
 */
export function consentsInForce(
  entries: { id: number; purpose: string; grantedAt: string; withdraws?: unknown }[],
): { purpose: string; since: string }[] {
  const withdrawn = new Set(
    entries.map((entry) => idOf(entry.withdraws)).filter((id) => id !== null),
  )
  return entries
    .filter((entry) => !entry.withdraws && !withdrawn.has(entry.id))
    .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt))
    .map((entry) => ({ purpose: labelOf(CONSENT_PURPOSES, entry.purpose), since: entry.grantedAt }))
}

export async function loadPersonTimeline(
  req: PayloadRequest,
  id: unknown,
): Promise<Result<PersonTimeline, ViewError>> {
  const refusal = refused(req, 'person')
  if (refusal) return refusal
  const parsed = personId.safeParse(id)
  if (!parsed.success) return err({ code: 'invalid', issues: ['Not a person’s record.'] })
  const user = asUser(req)
  const admin = req.payload.config.routes.admin
  const office = isOffice(req.user)
  const owner = hasRole(req.user as MaybeStaff, 'owner')
  const finance = hasRole(req.user as MaybeStaff, 'owner', 'finance')

  const person = await req.payload
    .findByID({ collection: 'people', id: parsed.data, depth: 0, disableErrors: true, ...user })
    .catch(() => null)
  if (!person) return err({ code: 'not-found' })

  const entries: TimelineEntry[] = []
  const push = (
    at: string | null | undefined,
    kind: TimelineEntry['kind'],
    label: string,
    href: string | null,
  ) => {
    if (at) entries.push({ at, kind, label, href })
  }

  const bookings = await req.payload.find({
    collection: 'bookings',
    where: { person: { equals: person.id } },
    sort: '-startsAt',
    limit: EACH,
    depth: 0,
    select: { reference: true, type: true, status: true, startsAt: true, createdAt: true },
    ...user,
  })
  for (const doc of bookings.docs) {
    push(
      doc.startsAt ?? doc.createdAt,
      'booking',
      `${labelOf(BOOKING_TYPES, doc.type)} ${doc.reference}: ${labelOf(BOOKING_STATUSES, doc.status)}`,
      `${admin}/collections/bookings/${doc.id}`,
    )
  }
  const bookingIds = bookings.docs.map((doc) => doc.id)

  let consents: PersonTimeline['consents'] = null
  if (office) {
    if (bookingIds.length) {
      const payments = await req.payload.find({
        collection: 'payments',
        where: { booking: { in: bookingIds } },
        limit: EACH,
        depth: 0,
        select: { status: true, capturedAt: true, createdAt: true, receipt: true },
        ...user,
      })
      for (const doc of payments.docs) {
        push(
          doc.capturedAt ?? doc.createdAt,
          'payment',
          `Payment ${doc.receipt}: ${labelOf(PAYMENT_STATUSES, doc.status)}`,
          `${admin}/collections/payments/${doc.id}`,
        )
      }
      const refunds = await req.payload.find({
        collection: 'refunds',
        where: { booking: { in: bookingIds } },
        limit: EACH,
        depth: 0,
        select: { status: true, createdAt: true },
        ...user,
      })
      for (const doc of refunds.docs) {
        push(
          doc.createdAt,
          'refund',
          `Refund: ${labelOf(REFUND_STATUSES, doc.status)}`,
          `${admin}/collections/refunds/${doc.id}`,
        )
      }
      if (finance) {
        const invoices = await req.payload.find({
          collection: 'invoices',
          where: { booking: { in: bookingIds } },
          limit: EACH,
          depth: 0,
          select: { number: true, status: true, issuedAt: true, createdAt: true },
          ...user,
        })
        for (const doc of invoices.docs) {
          push(
            doc.issuedAt ?? doc.createdAt,
            'invoice',
            `Invoice${doc.number ? ` ${doc.number}` : ''}: ${labelOf(INVOICE_STATUSES, doc.status)}`,
            `${admin}/collections/invoices/${doc.id}`,
          )
        }
      }
    }

    const ledger = await req.payload.find({
      collection: 'consents',
      where: { person: { equals: person.id } },
      sort: '-createdAt',
      limit: EACH,
      depth: 0,
      select: { purpose: true, grantedAt: true, withdrawnAt: true, withdraws: true },
      ...user,
    })
    for (const doc of ledger.docs) {
      const purpose = labelOf(CONSENT_PURPOSES, doc.purpose)
      push(
        doc.withdraws ? (doc.withdrawnAt ?? doc.grantedAt) : doc.grantedAt,
        'consent',
        doc.withdraws ? `Consent withdrawn: ${purpose}` : `Consent given: ${purpose}`,
        `${admin}/collections/consents/${doc.id}`,
      )
    }
    consents = consentsInForce(ledger.docs)

    const certificates = await req.payload.find({
      collection: 'certificates',
      where: { person: { equals: person.id } },
      limit: EACH,
      depth: 0,
      select: { certificateId: true, status: true, issuedAt: true, createdAt: true },
      ...user,
    })
    for (const doc of certificates.docs) {
      push(
        doc.issuedAt ?? doc.createdAt,
        'certificate',
        `Certificate ${doc.certificateId}: ${doc.status === 'revoked' ? 'revoked' : 'valid'}`,
        `${admin}/certificates/issue?certificate=${encodeURIComponent(doc.certificateId)}`,
      )
    }

    const feedback = await req.payload.find({
      collection: 'feedback',
      where: { person: { equals: person.id } },
      limit: EACH,
      depth: 0,
      select: { submittedAt: true, status: true },
      ...user,
    })
    for (const doc of feedback.docs) {
      push(
        doc.submittedAt,
        'feedback',
        'Feedback received',
        `${admin}/collections/feedback/${doc.id}`,
      )
    }

    const reviews = await req.payload.find({
      collection: 'testimonials',
      where: { person: { equals: person.id } },
      limit: EACH,
      depth: 0,
      select: { status: true, createdAt: true },
      ...user,
    })
    for (const doc of reviews.docs) {
      push(
        doc.createdAt,
        'review',
        `Review: ${doc.status}`,
        `${admin}/collections/testimonials/${doc.id}`,
      )
    }

    const requests = await req.payload.find({
      collection: 'data-requests',
      where: { person: { equals: person.id } },
      limit: EACH,
      depth: 0,
      select: { type: true, status: true, receivedAt: true },
      ...user,
    })
    for (const doc of requests.docs) {
      push(
        doc.receivedAt,
        'privacy-request',
        `Privacy request: ${labelOf(REQUEST_TYPES, doc.type)}, ${labelOf(REQUEST_STATUSES, doc.status).toLowerCase()}`,
        `${admin}/collections/data-requests/${doc.id}`,
      )
    }

    const leads = await req.payload.find({
      collection: 'leads',
      where: { person: { equals: person.id } },
      limit: EACH,
      depth: 0,
      select: { title: true, stage: true, createdAt: true },
      ...user,
    })
    for (const doc of leads.docs) {
      push(
        doc.createdAt,
        'lead',
        `Lead ${doc.title ?? doc.id}: ${labelOf(LEAD_STAGES, doc.stage)}`,
        `${admin}/collections/leads/${doc.id}`,
      )
    }
    const leadIds = leads.docs.map((doc) => doc.id)
    if (leadIds.length) {
      const activities = await req.payload.find({
        collection: 'lead-activities',
        where: { lead: { in: leadIds } },
        sort: '-at',
        limit: EACH,
        depth: 0,
        // The type and time only: an activity's words stay on the lead.
        select: { type: true, at: true, lead: true },
        ...user,
      })
      for (const doc of activities.docs) {
        push(
          doc.at,
          'activity',
          `Lead activity: ${doc.type}`,
          `${admin}/collections/leads/${idOf(doc.lead) ?? ''}`,
        )
      }
    }
  }

  // An owner sees that notes exist and when the latest was written, never their words.
  const counted = owner ? await countNotesForOwner(req, person.id) : null
  entries.sort((a, b) => b.at.localeCompare(a.at))
  return ok({
    personId: person.id,
    person: {
      fullName: person.fullName,
      mobile: person.mobile ?? null,
      email: person.email ?? null,
      preferredChannel: office ? (person.preferredChannel ?? null) : null,
    },
    consents,
    entries,
    notes: counted?.ok ? counted.value : null,
    notShown: notShownFor(req.user),
  })
}
