import 'server-only'

import {
  commitTransaction,
  initTransaction,
  killTransaction,
  type PayloadRequest,
  type Where,
} from 'payload'
import { z } from 'zod'

import { hasRole } from '@/access/roles'
import { viewRefusal } from '@/access/views'
import { erasePersonFromPipeline } from '@/lib/pipeline/core/hooks'
import { BY_THE_LEDGER } from '@/lib/proof/ledger'
import { err, ok, type Result } from '@/lib/result'
import { IST } from '@/lib/time/ist'

import { activeGrants, type LedgerEntry } from './consentLedger'
import { withdrawOnDeletion } from './consents'
import { ERASURE_CONTEXT } from './hooks'
import type {
  ConfirmErasure,
  ErasurePlan,
  PlanErasure,
  RequestError,
  RequestStatus,
} from './requests'
import { codeEnteredRecently } from './stepUp'
import { exportFolderOf, privateStore, type PrivateStore } from './store'

/**
 * An erasure request, planned and confirmed (docs/04, Rules; docs/05, Privacy; docs/18 §5).
 *
 * The person's record is emptied of who they were rather than removed: their bookings, payments
 * and privacy requests must keep pointing at a record (the database requires it), so it stays
 * with no name, contact details, workplace or profile. Deleted outright: their session notes,
 * feedback, reviews, enquiries (docs/17 §9), newsletter subscription and the access exports made
 * for them in the private store; their leads and the proposals sent to them keep no link to them.
 * Each consent still in force is withdrawn by a new ledger entry; the entries stay.
 * Kept, with the reason the owner reads: bookings (with what the person typed on them cleared),
 * payments, refunds and invoices (an invoice to an individual loses its name and address; one to a
 * GSTIN keeps them, as GST requires), certificates, the privacy requests, the audit log, and the
 * person's suppressed addresses, so nothing is ever sent to them again (D-110).
 *
 * The operator prepares and anyone in the office reads the plan; only an owner confirms, after
 * entering their two-factor code again (src/lib/privacy/stepUp.ts), and the whole plan runs in one
 * transaction, then closes the request. An operator's plan leaves out session notes, which the
 * office never sees (docs/05). Nothing here logs a name, a contact detail or a note.
 */

/** What an emptied record and an anonymised invoice say in place of the name. */
export const ERASED_NAME = 'Erased person'

export const PLAN_LINES = {
  profile: 'Name, contact details, workplace and profile on the person’s record',
  notes: 'Session notes',
  feedback: 'Feedback',
  reviews: 'Reviews',
  consents: 'Consents still in force, each withdrawn by a new ledger entry',
  bookingText: 'What the person typed on their bookings (a time request’s note, a job title)',
  invoiceBuyer: 'Name and address on invoices to them as an individual (no GSTIN)',
  enquiries: 'Enquiries they sent through the site’s forms',
  pipelineLinks: 'Their name on leads and on proposals sent to them (the leads stay)',
  subscriber: 'Their newsletter subscription',
  exports: 'Access requests’ exports in the private store',
  record: 'The person’s record, emptied',
  bookings: 'Bookings',
  payments: 'Payments',
  refunds: 'Refunds',
  invoices: 'Invoices',
  certificates: 'Certificates',
  requests: 'Privacy requests',
  ledger: 'Consent ledger entries',
  audit: 'Audit log entries about the record',
  suppressions: 'Suppressed addresses',
} as const

export const KEEP_REASONS = {
  record:
    'Bookings, payments and this request must point at a record; it keeps them in order without saying who it was.',
  bookings: 'The record behind payments, invoices and the calendar.',
  payments: 'Kept for the accounts and GST.',
  refunds: 'Kept for the accounts and GST.',
  invoices: 'Kept as GST law requires; Zoho Books holds the issued copy.',
  certificates:
    'A certificate stays verifiable until an owner revokes it under Certificates (awaiting IIIC’s decision).',
  requests: 'The record that each request was received and handled.',
  ledger:
    'The ledger keeps what the person agreed to and when it ended; no entry is changed or deleted.',
  audit: 'A required log. It names records and fields, never what they held.',
  suppressions:
    'Each holds an address and why nothing goes to it, and is kept so nothing is sent there again.',
} as const

const requestId = z.number().int().positive()

/** An invoice to an individual: no GSTIN on it. */
const INDIVIDUAL: Where = {
  or: [{ 'buyer.gstin': { exists: false } }, { 'buyer.gstin': { equals: '' } }],
}

type Staff = { id: number }

type ErasureRequest = {
  id: number
  type: string
  status: RequestStatus
  verifiedAt?: string | null
  person: number
}

const idOf = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'number') {
    return (value as { id: number }).id
  }
  return undefined
}

/** The request, read with the user's own access, if it is a verified erasure still open. */
async function openErasure(
  req: PayloadRequest,
  id: unknown,
): Promise<Result<ErasureRequest, RequestError>> {
  const parsed = requestId.safeParse(id)
  if (!parsed.success) return err({ code: 'invalid', issues: ['requestId: invalid'] })
  const doc = await req.payload
    .findByID({
      collection: 'data-requests',
      id: parsed.data,
      depth: 0,
      disableErrors: true,
      overrideAccess: false,
      user: req.user,
      req,
    })
    .catch(() => null)
  const person = idOf(doc?.person)
  if (!doc || person === undefined) return err({ code: 'not-found' })
  if (doc.type !== 'erasure' || doc.status === 'closed') {
    return err({ code: 'not-now', status: doc.status })
  }
  if (!doc.verifiedAt) return err({ code: 'not-verified' })
  return ok({ ...doc, person } as ErasureRequest)
}

/**
 * The person's newsletter entry: linked to them once confirmed, or still pending under their email
 * address. Their suppressed addresses: linked to them, or under their email or mobile.
 */
function addressRules(personId: number, record: { email?: string | null; mobile?: string | null }) {
  const person: Where = { person: { equals: personId } }
  const email = record.email?.trim().toLowerCase()
  const mobile = record.mobile?.trim()
  const addresses = [email, mobile].filter((value): value is string => Boolean(value))
  return {
    subscriber: { or: [person, ...(email ? [{ email: { equals: email } }] : [])] } as Where,
    suppressions: {
      or: [person, ...(addresses.length ? [{ address: { in: addresses } }] : [])],
    } as Where,
  }
}

/** What erasing one person touches, counted past the rules (counts only, never contents). */
async function survey(req: PayloadRequest, personId: number) {
  const count = (collection: Parameters<typeof req.payload.count>[0]['collection'], where: Where) =>
    req.payload.count({ collection, where, overrideAccess: true, req }).then((r) => r.totalDocs)
  const person = { person: { equals: personId } }
  const record = await req.payload.findByID({
    collection: 'people',
    id: personId,
    depth: 0,
    select: { email: true, mobile: true },
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  const rules = addressRules(personId, record ?? {})

  const bookingDocs = await req.payload.find({
    collection: 'bookings',
    where: { or: [person, { bookedBy: { equals: personId } }] },
    depth: 0,
    pagination: false,
    select: { person: true },
    overrideAccess: true,
    req,
  })
  const ledger = await req.payload.find({
    collection: 'consents',
    where: person,
    depth: 0,
    pagination: false,
    select: { purpose: true, grantedAt: true, withdrawnAt: true, withdraws: true },
    overrideAccess: true,
    req,
  })
  const bookingIds = bookingDocs.docs.map((doc) => doc.id)
  const ownBookings = bookingDocs.docs.filter((doc) => idOf(doc.person) === personId).length
  const onBookings: Where = { booking: { in: bookingIds.length ? bookingIds : [0] } }

  const requests = await req.payload.find({
    collection: 'data-requests',
    where: person,
    depth: 0,
    pagination: false,
    select: { exportKey: true },
    overrideAccess: true,
    req,
  })

  // One query at a time: inside the erasure's transaction they share one connection.
  return {
    rules,
    requestIds: requests.docs.map((doc) => doc.id),
    exports: requests.docs.filter((doc) => Boolean(doc.exportKey)).length,
    enquiries: await count('enquiries', person),
    pipelineLinks:
      (await count('leads', person)) +
      (await count('proposal-versions', { 'sending.sentTo': { equals: personId } })),
    subscribers: await count('subscribers', rules.subscriber),
    suppressions: await count('suppressions', rules.suppressions),
    bookingIds,
    ownBookings,
    notes: await count('session-notes', person),
    feedback: await count('feedback', person),
    reviews: await count('testimonials', person),
    consentsInForce: activeGrants(ledger.docs as LedgerEntry[]).length,
    ledger: ledger.docs.length,
    payments: await count('payments', onBookings),
    refunds: await count('refunds', onBookings),
    invoices: await count('invoices', onBookings),
    individualInvoices: await count('invoices', { and: [onBookings, INDIVIDUAL] }),
    certificates: await count('certificates', person),
    requests: requests.docs.length,
    audit: await count('audit-log', {
      and: [{ entity: { equals: 'people' } }, { entityId: { equals: String(personId) } }],
    }),
  }
}

/** The counts a plan is made from. */
export type ErasureSurvey = Omit<Awaited<ReturnType<typeof survey>>, 'rules' | 'requestIds'>

/** The plan as the owner reads it; the operator's leaves out session notes. */
export function planOf(found: ErasureSurvey, forOwner: boolean): ErasurePlan {
  return {
    deletes: [
      { entity: PLAN_LINES.profile, count: 1 },
      ...(forOwner ? [{ entity: PLAN_LINES.notes, count: found.notes }] : []),
      { entity: PLAN_LINES.feedback, count: found.feedback },
      { entity: PLAN_LINES.reviews, count: found.reviews },
      { entity: PLAN_LINES.consents, count: found.consentsInForce },
      { entity: PLAN_LINES.bookingText, count: found.ownBookings },
      { entity: PLAN_LINES.invoiceBuyer, count: found.individualInvoices },
      { entity: PLAN_LINES.enquiries, count: found.enquiries },
      { entity: PLAN_LINES.pipelineLinks, count: found.pipelineLinks },
      { entity: PLAN_LINES.subscriber, count: found.subscribers },
      { entity: PLAN_LINES.exports, count: found.exports },
    ],
    keeps: [
      { entity: PLAN_LINES.record, count: 1, why: KEEP_REASONS.record },
      { entity: PLAN_LINES.bookings, count: found.bookingIds.length, why: KEEP_REASONS.bookings },
      { entity: PLAN_LINES.payments, count: found.payments, why: KEEP_REASONS.payments },
      { entity: PLAN_LINES.refunds, count: found.refunds, why: KEEP_REASONS.refunds },
      { entity: PLAN_LINES.invoices, count: found.invoices, why: KEEP_REASONS.invoices },
      {
        entity: PLAN_LINES.certificates,
        count: found.certificates,
        why: KEEP_REASONS.certificates,
      },
      { entity: PLAN_LINES.requests, count: found.requests, why: KEEP_REASONS.requests },
      { entity: PLAN_LINES.ledger, count: found.ledger, why: KEEP_REASONS.ledger },
      { entity: PLAN_LINES.audit, count: found.audit, why: KEEP_REASONS.audit },
      {
        entity: PLAN_LINES.suppressions,
        count: found.suppressions,
        why: KEEP_REASONS.suppressions,
      },
    ],
  }
}

/** What an erasure would do, for the office to read before an owner confirms. */
export const planErasure: PlanErasure = async (req, id) => {
  const refusal = viewRefusal(req.user, 'privacy')
  if (refusal) return err({ code: 'refused', refusal })
  const request = await openErasure(req, id)
  if (!request.ok) return request
  const found = await survey(req, request.value.person)
  return ok(planOf(found, hasRole(req.user, 'owner')))
}

async function inTransaction<T>(req: PayloadRequest, work: () => Promise<T>): Promise<T> {
  const owned = await initTransaction(req)
  try {
    const result = await work()
    if (owned) await commitTransaction(req)
    return result
  } catch (error) {
    if (owned) await killTransaction(req)
    throw error
  }
}

/**
 * The owner's Confirm erasure: runs the plan in one transaction and closes the request as done.
 * Refused unless the owner entered their code again on this request, and unless the request is
 * a verified erasure waiting for an owner. The access exports go from the private store last,
 * inside the transaction's work, so a store that fails rolls the whole erasure back.
 */
export const confirmErasureWith =
  (store: () => PrivateStore | null): ConfirmErasure =>
  async (req, id) => {
    const refusal = viewRefusal(req.user, 'privacyDecision')
    if (refusal) return err({ code: 'refused', refusal })
    if (!codeEnteredRecently(req)) {
      return err({ code: 'refused', refusal: { status: 403, code: 'enter-code' } })
    }
    const request = await openErasure(req, id)
    if (!request.ok) return request
    if (request.value.status !== 'awaitingOwner') {
      return err({ code: 'not-now', status: request.value.status })
    }
    const personId = request.value.person
    const owner = req.user as unknown as Staff

    const deleted = await inTransaction(req, async () => {
      const found = await survey(req, personId)
      const person = { person: { equals: personId } }
      const notes = await req.payload.delete({
        collection: 'session-notes',
        where: person,
        overrideAccess: true,
        req,
      })
      const feedback = await req.payload.delete({
        collection: 'feedback',
        where: person,
        overrideAccess: true,
        req,
      })
      // Reviews go as a person's deletion takes them (src/lib/proof/ledger.ts).
      const reviews = await req.payload.delete({
        collection: 'testimonials',
        where: person,
        context: { [BY_THE_LEDGER]: true },
        overrideAccess: true,
        req,
      })
      await withdrawOnDeletion(req, personId)
      // Enquiries, and the links on leads and sent proposals (docs/17 §9).
      const pipeline = await erasePersonFromPipeline(req, personId)
      const subscribers = await req.payload.delete({
        collection: 'subscribers',
        where: found.rules.subscriber,
        overrideAccess: true,
        req,
      })

      const bookings = await req.payload.find({
        collection: 'bookings',
        where: { id: { in: found.bookingIds.length ? found.bookingIds : [0] } },
        depth: 0,
        pagination: false,
        select: { person: true, bookedBy: true, timeRequest: true, company: true },
        overrideAccess: true,
        req,
      })
      for (const booking of bookings.docs) {
        const own = idOf(booking.person) === personId
        await req.payload.update({
          collection: 'bookings',
          id: booking.id,
          data: {
            ...(own
              ? {
                  timeRequest: { ...booking.timeRequest, note: null },
                  company: { ...booking.company, role: null },
                }
              : {}),
            ...(idOf(booking.bookedBy) === personId ? { bookedBy: null } : {}),
          },
          depth: 0,
          overrideAccess: true,
          req,
        })
      }
      if (found.bookingIds.length) {
        await req.payload.update({
          collection: 'invoices',
          where: {
            and: [{ booking: { in: found.bookingIds } }, INDIVIDUAL],
          },
          data: { buyer: { name: ERASED_NAME, address: null } },
          depth: 0,
          overrideAccess: true,
          req,
        })
      }

      await req.payload.update({
        collection: 'people',
        id: personId,
        data: {
          fullName: ERASED_NAME,
          mobile: null,
          email: null,
          mobileVerifiedAt: null,
          emailVerifiedAt: null,
          preferredChannel: null,
          ageBand: null,
          city: null,
          source: null,
          utm: { source: null, medium: null, campaign: null, term: null, content: null },
          tags: [],
          organisation: null,
          jobTitle: null,
          whatsappLastInboundAt: null,
        },
        depth: 0,
        overrideAccess: true,
        req,
      })

      // The requests' pointers to the access exports made for them; the requests stay.
      if (found.exports) {
        await req.payload.update({
          collection: 'data-requests',
          where: { and: [{ person: { equals: personId } }, { exportKey: { exists: true } }] },
          data: { exportKey: null },
          depth: 0,
          overrideAccess: true,
          req,
        })
      }

      const now = new Date().toISOString()
      await req.payload.update({
        collection: 'data-requests',
        id: request.value.id,
        data: {
          status: 'closed',
          resolution: {
            outcome: 'fulfilled',
            closedAt: now,
            closedAt_tz: IST,
            erasureConfirmedAt: now,
            erasureConfirmedAt_tz: IST,
            decidedBy: owner.id,
          },
        },
        depth: 0,
        overrideAccess: true,
        req,
        context: { [ERASURE_CONTEXT]: true, auditAction: 'confirm-erasure' },
      })

      // The export files last: the store is outside the transaction, so a failure before this point
      // leaves them with the rest, and a failure here rolls the database back.
      const target = store()
      if (target) {
        for (const requestId of found.requestIds) await target.removeAll(exportFolderOf(requestId))
      }
      return (
        notes.docs.length +
        feedback.docs.length +
        reviews.docs.length +
        pipeline.enquiries +
        subscribers.docs.length
      )
    })
    return ok({ deleted })
  }

export const confirmErasure: ConfirmErasure = confirmErasureWith(privateStore)
