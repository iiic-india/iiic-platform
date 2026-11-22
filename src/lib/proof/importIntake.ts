import {
  commitTransaction,
  createLocalReq,
  initTransaction,
  killTransaction,
  ValidationError,
  type Payload,
  type PayloadRequest,
  type RequiredDataFromCollectionSlug,
  type Where,
} from 'payload'

import { currentNotice } from '@/lib/privacy/consents'

import { replyChannel, type IntakeProblem, type IntakeRow } from './intake'
import { PUBLICATION } from './ledger'

/**
 * The one-off import of the reviews intake sheet (I-42; docs/05, Proof: "import the intake
 * sheet"). For each row: the person (found by their verified or unverified email or mobile
 * number, or added), the consent they gave to publish with its evidence (when the sheet records
 * a yes), and the review at status received, linked to both. Each row is one transaction, so a
 * row is recorded whole or not at all. A row whose Ref is already imported is left alone, so
 * the import is safe to run again after the sheet is corrected. Nothing is ever published by
 * the import: an owner publishes each review after the screening and the consent are checked.
 * The report names rows by their Ref and number only, never a person (CLAUDE.md, Conventions).
 */

/** Where an imported consent says it came from. */
export const INTAKE_FORM = 'Review consent request (reviews intake sheet)'

/** What a person record says about how they reached IIIC. */
export const INTAKE_SOURCE = 'Reviews intake sheet'

export const IMPORT_MESSAGES = {
  noNotice:
    'No consent text for publishing a testimonial was in force on the consent date: add it under Content → Consent texts, in force from that date or before, and run the import again.',
} as const

export type ImportReport = {
  imported: string[]
  alreadyImported: string[]
  refused: IntakeProblem[]
}

/** The messages of a refusal, as the admin would show them beside the fields. */
function messagesOf(error: unknown): string[] {
  if (error instanceof ValidationError) {
    return error.data.errors.map(({ path, message }) => `${path}: ${message}`)
  }
  return [error instanceof Error ? error.message : 'The row could not be recorded.']
}

/** The person a row is about: the record that holds their contact, or a new one. */
async function personFor(req: PayloadRequest, person: IntakeRow['person']) {
  const byContact: Where[] = []
  if (person.email) byContact.push({ email: { equals: person.email } })
  if (person.mobile) byContact.push({ mobile: { equals: person.mobile } })
  if (byContact.length) {
    const { docs } = await req.payload.find({
      collection: 'people',
      where: { or: byContact },
      sort: 'createdAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (docs[0]) return docs[0].id
  }
  const created = await req.payload.create({
    collection: 'people',
    data: {
      fullName: person.fullName,
      email: person.email,
      mobile: person.mobile,
      ageBand: person.ageBand,
      source: INTAKE_SOURCE,
    } as RequiredDataFromCollectionSlug<'people'>,
    overrideAccess: true,
    req,
  })
  return created.id
}

/** Records one row, in the request's transaction. */
async function recordRow(req: PayloadRequest, row: IntakeRow): Promise<void> {
  const personId = await personFor(req, row.person)
  let consentId: number | string | null = null
  if (row.consent) {
    const notice = await currentNotice(
      req.payload,
      PUBLICATION,
      'en-IN',
      new Date(row.consent.grantedAt),
    )
    if (!notice) throw new Error(IMPORT_MESSAGES.noNotice)
    const consent = await req.payload.create({
      collection: 'consents',
      data: {
        person: personId,
        noticeVersion: notice.id,
        grantedAt: row.consent.grantedAt,
        channel: replyChannel(row.consent.evidence),
        evidence: { form: INTAKE_FORM, reference: row.consent.evidence },
      } as RequiredDataFromCollectionSlug<'consents'>,
      overrideAccess: true,
      req,
    })
    consentId = consent.id
  }
  await req.payload.create({
    collection: 'testimonials',
    data: {
      ...row.review,
      intakeRef: row.ref,
      origin: 'earlierProgramme',
      status: 'received',
      person: personId,
      consent: consentId,
      translationApproved: false,
      excerptApproved: false,
    } as RequiredDataFromCollectionSlug<'testimonials'>,
    overrideAccess: true,
    req,
  })
}

/** Imports the rows the sheet gave (./intake.ts), each whole or not at all. */
export async function importIntake(
  payload: Payload,
  rows: readonly IntakeRow[],
): Promise<ImportReport> {
  const report: ImportReport = { imported: [], alreadyImported: [], refused: [] }
  for (const row of rows) {
    const { totalDocs } = await payload.count({
      collection: 'testimonials',
      where: { intakeRef: { equals: row.ref } },
      overrideAccess: true,
    })
    if (totalDocs > 0) {
      report.alreadyImported.push(row.ref)
      continue
    }
    const req = await createLocalReq({}, payload)
    await initTransaction(req)
    try {
      await recordRow(req, row)
      await commitTransaction(req)
      report.imported.push(row.ref)
    } catch (error) {
      await killTransaction(req)
      report.refused.push({ row: row.row, ref: row.ref, messages: messagesOf(error) })
    }
  }
  return report
}
