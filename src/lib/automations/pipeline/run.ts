import 'server-only'

import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import { plan } from '@/lib/automations/operations/core'
import { done, RecordId, type Outcome } from '@/lib/automations/operations/outcome'
import type { CreateTask, AddWorkingDays } from '@/lib/pipeline/tasks'
import { idOf } from '@/lib/privacy/consentLedger'
import { istDay } from '@/lib/time/ist'

/**
 * The pipeline's automations that are M6's (docs/06 P1, P6, P7; docs/19 §5), on M4's records and
 * events (docs/17). M4 does the rest itself: the lead, its timeline and the first-reply task are
 * made in the request's own transaction (ReceiveEnquiry), a booked proposal call is put on its
 * lead (`P2-lead-from-call`), the alerts are raised hourly (`P3-P4-lead-alerts`), and the send
 * makes the follow-up task and emails the link through M6's core (P5, proposalMailer.ts).
 *
 * P1 and P7 · on `enquiry.received`: the acknowledgement by email to the person who sent the
 * form, once per request (the message is about the enquiry, so a second request that joins an
 * open lead is answered too). Each task answers only its own kind of request.
 *
 * P6 · each morning: a proposal still `sent` (never opened, never answered) five working days
 * after its current version went gets one task for the office to write and send the follow-up
 * (docs/13 §4: the operator reviews and sends it). The drafted words are not the platform's to
 * invent: until IIIC supplies them, the task carries their placeholder.
 */

export const ACK_AUTOMATION = { teamMap: 'P1', partnership: 'P7' } as const
const ACK_TEMPLATE = { teamMap: 'team-map-ack', partnership: 'partnership-ack' } as const

const EnquiryEvent = z.object({ enquiryId: RecordId })

/** P1 or P7: one acknowledgement for one request of the task's own kind. */
export async function runAcknowledgement(
  kind: keyof typeof ACK_AUTOMATION,
  req: PayloadRequest,
  input: unknown,
  now: Date,
): Promise<Outcome> {
  const { enquiryId } = EnquiryEvent.parse(input)
  const enquiry = await req.payload.findByID({
    collection: 'enquiries',
    id: enquiryId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    select: { kind: true, status: true, person: true },
    req,
  })
  if (!enquiry) return done(0, 'not-found')
  if (enquiry.kind !== kind) return done(0, 'other-kind')
  if (enquiry.status === 'spam') return done(0, 'spam')
  const personId = idOf(enquiry.person)
  if (personId === null) return done(0, 'no-person')
  const result = await plan(req, {
    automation: ACK_AUTOMATION[kind],
    template: ACK_TEMPLATE[kind],
    channel: 'email',
    recipient: { kind: 'person', id: Number(personId) },
    subject: { collection: 'enquiries', id: enquiry.id },
    sendAt: now,
  })
  return result.ok ? done(result.value.created ? 1 : 0) : done(0, result.error.code)
}

export const runP1 = (req: PayloadRequest, input: unknown, now: Date) =>
  runAcknowledgement('teamMap', req, input, now)

export const runP7 = (req: PayloadRequest, input: unknown, now: Date) =>
  runAcknowledgement('partnership', req, input, now)

// ---- P6 · the unanswered proposal ----

/** docs/06 P6: "Proposal not opened or answered", five working days after it was sent. */
export const FOLLOW_UP_DRAFT_WORKING_DAYS = 5

/** The office's words for P6's task, and the placeholder for the drafted email (a new input). */
export const P6_TASK = {
  title: (reference: string) =>
    `Proposal ${reference} not opened in five working days: send the follow-up`,
  draft: '[[TODO: the words of the drafted follow-up email, for IIIC to supply]]',
} as const

export type FollowUpDeps = { createTask: CreateTask; addWorkingDays: AddWorkingDays }

async function defaultFollowUpDeps(): Promise<FollowUpDeps> {
  const [{ createTask }, { addWorkingDays }] = await Promise.all([
    import('@/lib/pipeline/core/tasks'),
    import('@/lib/pipeline/core/workingDays'),
  ])
  return { createTask, addWorkingDays }
}

export async function runP6(req: PayloadRequest, now: Date, deps?: FollowUpDeps): Promise<Outcome> {
  const { createTask, addWorkingDays } = deps ?? (await defaultFollowUpDeps())
  const today = istDay(now)
  const { docs } = await req.payload.find({
    collection: 'proposals',
    where: { and: [{ status: { equals: 'sent' } }, { sentVersion: { exists: true } }] },
    depth: 0,
    limit: 500,
    select: { reference: true, lead: true, sentVersion: true },
    overrideAccess: true,
    req,
  })
  let made = 0
  for (const proposal of docs) {
    const versionId = idOf(proposal.sentVersion)
    const leadId = idOf(proposal.lead)
    if (versionId === null || leadId === null) continue
    const version = await req.payload.findByID({
      collection: 'proposal-versions',
      id: Number(versionId),
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
      select: { sending: true },
      req,
    })
    const sentAt = version?.sending?.sentAt
    if (!sentAt) continue
    if (addWorkingDays(new Date(sentAt), FOLLOW_UP_DRAFT_WORKING_DAYS) > today) continue
    const lead = await req.payload.findByID({
      collection: 'leads',
      id: Number(leadId),
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
      select: { owner: true },
      req,
    })
    // One task per version sent: a later run, or a retry, finds it and makes no second one.
    const key = `P6:version:${versionId}`
    const existing = await req.payload.count({
      collection: 'tasks',
      where: { key: { equals: key } },
      overrideAccess: true,
      req,
    })
    if (existing.totalDocs > 0) continue
    const owner = idOf(lead?.owner)
    const task = await createTask(req, {
      kind: 'reviewFollowUpDraft',
      title: P6_TASK.title(proposal.reference ?? String(proposal.id)),
      dueOn: today,
      role: 'operator',
      ...(owner !== null ? { assigneeId: Number(owner) } : {}),
      leadId: Number(leadId),
      note: P6_TASK.draft,
      automation: 'P6',
      key,
    })
    if (task.ok) made += 1
  }
  return done(made)
}
