import {
  APIError,
  ValidationError,
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  type CollectionBeforeDeleteHook,
  type CollectionSlug,
  type PayloadRequest,
} from 'payload'

import { IST } from '@/lib/time/ist'

import { domainOf, isFinalStage } from '../fields'
import { REASON_STAGES, type LeadKind, type LeadStage } from '../stages'
import { TASK_MOVES, type TaskStatus } from '../values'
import { isStaffActivityType } from './activities'
import { actorOf, asPlatform, idOf, isStaffWrite } from './actor'
import { emitPipelineEvent } from './emit'
import { nameKeyOf } from './match'
import { applyMove, canMoveLead } from './moves'
import { HOOK_MESSAGES, leadTitle, SPAM_REASON } from './strings'

/**
 * The pipeline collections' own rules (docs/17 §2–§4, §9), for every write, the admin's form
 * included: the CRM core's hooks. Plain modules only: the collections are loaded wherever the
 * Payload config is (the CLI too), so nothing here is `server-only` or reads a secret. A write by
 * the staff and a write by the platform (src/lib/pipeline/core/actor.ts) meet the same rules.
 */

type Data = Record<string, unknown>

function refuse(collection: CollectionSlug, path: string, message: string): never {
  throw new ValidationError({ collection, errors: [{ path, message }] })
}

const nowIso = () => new Date().toISOString()

const later = (a: unknown, b: unknown) =>
  typeof b !== 'string' || (typeof a === 'string' && new Date(a).getTime() > new Date(b).getTime())

// Organisations ---------------------------------------------------------------------------------

/**
 * The matching keys (docs/17 §4): the name's key, from the name; the domain, from the website's
 * host when there is a website, else the one the platform recorded from a work email.
 */
export const organisationKeys: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const draft = (data ?? {}) as Data
  const merged = { ...(originalDoc ?? {}), ...draft } as Data
  if (typeof merged.name === 'string') draft.nameKey = nameKeyOf(merged.name)
  const website = typeof merged.website === 'string' ? merged.website : ''
  const host = website ? domainOf(website) : null
  if (host) draft.domain = host
  return draft
}

/** A renamed organisation's leads take its new name (their titles are the platform's). */
export const retitleLeads: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  if (operation !== 'update' || previousDoc?.name === doc.name) return doc
  const { docs } = await req.payload.find({
    collection: 'leads',
    where: { organisation: { equals: doc.id } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })
  for (const lead of docs) {
    const title = leadTitle(doc.name, lead.kind as LeadKind)
    if (lead.title === title) continue
    await req.payload.update({
      collection: 'leads',
      id: lead.id,
      data: { title },
      depth: 0,
      overrideAccess: true,
      req,
    })
  }
  return doc
}

// Leads -----------------------------------------------------------------------------------------

/**
 * Before a lead is saved: its kind stays as it was made; its title is named from its organisation
 * and kind; a move of its stage is held to STAGE_MOVES and stamped (`stageChangedAt`, the last
 * activity, `closedAt` on an end, `touchedAt` for a move by the staff).
 */
export const prepareLead: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  const draft = (data ?? {}) as Data
  const before = (originalDoc ?? {}) as Data
  if (operation === 'update' && 'kind' in draft && draft.kind !== before.kind) {
    refuse('leads', 'kind', HOOK_MESSAGES.kindFixed)
  }
  const merged = { ...before, ...draft }
  const kind = merged.kind as LeadKind

  const organisationId = idOf(merged.organisation)
  const organisation =
    organisationId === null
      ? null
      : await req.payload.findByID({
          collection: 'organisations',
          id: organisationId,
          depth: 0,
          disableErrors: true,
          overrideAccess: true,
          req,
        })
  draft.title = leadTitle(organisation?.name, kind)

  const now = nowIso()
  if (operation === 'create') {
    draft.stageChangedAt ??= now
    if (isFinalStage(merged.stage as LeadStage)) draft.closedAt ??= now
    return draft
  }
  const from = before.stage as LeadStage
  const to = merged.stage as LeadStage
  if (from === to) return draft
  if (!canMoveLead(kind, from, to)) {
    refuse(
      'leads',
      'stage',
      isFinalStage(from) ? HOOK_MESSAGES.ended : HOOK_MESSAGES.badMove(from, to),
    )
  }
  draft.stageChangedAt = now
  draft.lastActivityAt = now
  if (actorOf(req).by !== null && !before.touchedAt) draft.touchedAt = now
  if (isFinalStage(to)) draft.closedAt = now
  return draft
}

/**
 * After a lead is saved: a new lead emits `lead.created`; a move writes its `stageChange` entry
 * (with the reason for an end that needs one) and emits `lead.stageChanged`, keyed by the entry.
 */
export const recordLeadChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  if (operation === 'create') {
    await emitPipelineEvent(req, {
      name: 'lead.created',
      leadId: doc.id,
      kind: doc.kind,
      source: doc.source,
    })
    return doc
  }
  const from = previousDoc?.stage as LeadStage | undefined
  const to = doc.stage as LeadStage
  if (!from || from === to) return doc
  const { by } = actorOf(req)
  const activity = await asPlatform(req, by, () =>
    req.payload.create({
      collection: 'lead-activities',
      data: {
        lead: doc.id,
        type: 'stageChange',
        at: doc.stageChangedAt ?? nowIso(),
        at_tz: IST,
        by,
        fromStage: from,
        toStage: to,
        ...((REASON_STAGES as readonly LeadStage[]).includes(to) && doc.endReason
          ? { body: doc.endReason }
          : {}),
      },
      depth: 0,
      overrideAccess: true,
      req,
    }),
  )
  await emitPipelineEvent(req, {
    name: 'lead.stageChanged',
    leadId: doc.id,
    activityId: activity.id,
    from,
    to,
  })
  return doc
}

// Lead activities -------------------------------------------------------------------------------

/**
 * Before an entry is saved: entries are never changed (a slip is a new note); the staff write
 * only their own kinds of entry, as themselves; the platform's entries carry whose they are.
 */
export const prepareActivity: CollectionBeforeChangeHook = ({ data, operation, req }) => {
  if (operation === 'update') throw new APIError(HOOK_MESSAGES.activityFixed, 403)
  const draft = (data ?? {}) as Data
  const actor = actorOf(req)
  if (isStaffWrite(req)) {
    if (!isStaffActivityType(draft.type)) refuse('lead-activities', 'type', HOOK_MESSAGES.staffType)
    draft.by = actor.by
  } else if (actor.platform) {
    draft.by = actor.by
  }
  draft.at ??= nowIso()
  return draft
}

/**
 * After an entry is written: the lead's last activity moves on to it, if it is later, and an
 * entry by the staff marks the lead as acted on (`touchedAt`), which stops the first-reply clock.
 */
export const stampLeadFromActivity: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create') return doc
  const leadId = idOf(doc.lead)
  if (leadId === null) return doc
  const lead = await req.payload.findByID({
    collection: 'leads',
    id: leadId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  if (!lead) return doc
  const patch: Data = {}
  if (later(doc.at, lead.lastActivityAt)) patch.lastActivityAt = doc.at
  if (idOf(doc.by) !== null && !lead.touchedAt) patch.touchedAt = doc.at
  if (Object.keys(patch).length === 0) return doc
  await req.payload.update({
    collection: 'leads',
    id: lead.id,
    data: patch,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return doc
}

// Tasks -----------------------------------------------------------------------------------------

/** A task is done or cancelled once (TASK_MOVES); closing it records when and by whom. */
export const holdTaskMoves: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  const draft = (data ?? {}) as Data
  const before = (originalDoc ?? {}) as Data
  const to = (draft.status ?? (operation === 'create' ? 'open' : before.status)) as TaskStatus
  const from = (operation === 'create' ? null : before.status) as TaskStatus | null
  if (from !== null && from !== to && !TASK_MOVES[from].includes(to)) {
    refuse('tasks', 'status', HOOK_MESSAGES.taskClosed)
  }
  if (to !== 'open' && from !== to) {
    draft.doneAt = nowIso()
    draft.doneBy = actorOf(req).by
  }
  return draft
}

/** A new task emits `task.created`, for Today (M5). */
export const announceTask: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation === 'create') await emitPipelineEvent(req, { name: 'task.created', taskId: doc.id })
  return doc
}

// Enquiries -------------------------------------------------------------------------------------

/**
 * An enquiry the office marks as spam (docs/17 §4): if it made its lead and no other genuine
 * request has joined that lead since, the lead ends, Lost or Closed, with the reason "Spam", as
 * the office's move. The enquiry itself stays, for the audit.
 */
export const closeSpamLead: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  if (operation !== 'update' || doc.status !== 'spam' || previousDoc?.status === 'spam') return doc
  if (doc.outcome !== 'newLead') return doc
  const leadId = idOf(doc.lead)
  if (leadId === null) return doc
  const lead = await req.payload.findByID({
    collection: 'leads',
    id: leadId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  if (!lead || isFinalStage(lead.stage as LeadStage)) return doc
  const others = await req.payload.count({
    collection: 'enquiries',
    where: {
      and: [
        { lead: { equals: leadId } },
        { id: { not_equals: doc.id } },
        { status: { not_equals: 'spam' } },
      ],
    },
    overrideAccess: true,
    req,
  })
  if (others.totalDocs > 0) return doc
  await applyMove(req, {
    leadId,
    to: lead.kind === 'partnership' ? 'closed' : 'lost',
    reason: SPAM_REASON,
    by: actorOf(req).by,
  })
  return doc
}

// People ----------------------------------------------------------------------------------------

/**
 * Erasing a person from the pipeline (docs/17 §9): their enquiries, the copies of what they typed,
 * are deleted, and their leads and the proposal versions sent to them keep no link to them. Run in
 * the caller's transaction by both ways a person goes: the owner's Confirm erasure, which empties
 * the record in place (src/lib/privacy/erasure.ts, D-97), and a deletion of the record. Their
 * consents are withdrawn by the consent hook or the erasure; the office reviews the leads' notes as
 * part of the request (M5). Returns how many enquiries went and how many links were emptied.
 */
export async function erasePersonFromPipeline(
  req: PayloadRequest,
  personId: number | string,
): Promise<{ enquiries: number; links: number }> {
  const enquiries = await req.payload.delete({
    collection: 'enquiries',
    where: { person: { equals: personId } },
    overrideAccess: true,
    req,
  })
  const leads = await req.payload.find({
    collection: 'leads',
    where: { person: { equals: personId } },
    pagination: false,
    depth: 0,
    select: { person: true },
    overrideAccess: true,
    req,
  })
  for (const lead of leads.docs) {
    await req.payload.update({
      collection: 'leads',
      id: lead.id,
      data: { person: null },
      depth: 0,
      overrideAccess: true,
      req,
    })
  }
  const versions = await req.payload.find({
    collection: 'proposal-versions',
    where: { 'sending.sentTo': { equals: personId } },
    pagination: false,
    depth: 0,
    select: { sending: true },
    overrideAccess: true,
    req,
  })
  for (const version of versions.docs) {
    await req.payload.update({
      collection: 'proposal-versions',
      id: version.id,
      data: { sending: { ...version.sending, sentTo: null } },
      depth: 0,
      overrideAccess: true,
      req,
    })
  }
  return {
    enquiries: enquiries.docs.length,
    links: leads.docs.length + versions.docs.length,
  }
}

/** A deletion of the person's record takes them out of the pipeline first. */
export const eraseFromPipeline: CollectionBeforeDeleteHook = async ({ id, req }) => {
  await erasePersonFromPipeline(req, id)
}
