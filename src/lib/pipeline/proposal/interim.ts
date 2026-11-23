import 'server-only'

import type { IstDay } from '@/lib/booking/types'
import { err, ok } from '@/lib/result'
import { istDay } from '@/lib/time/ist'

import type { EmitPipelineEvent } from '../events'
import type { LogActivity, MoveLead } from '../leads'
import { FINAL_STAGES, REASON_STAGES, STAGE_MOVES, STALE_STAGES, UNTOUCHED_STAGE } from '../stages'
import type { LeadStage } from '../stages'
import { STALE_AFTER_DAYS, UNTOUCHED_HOURS, type HeatOf } from '../staleness'
import type { AddWorkingDays, CreateTask } from '../tasks'

/**
 * INTERIM. Stand-ins for the CRM builder's operations (builder A, src/lib/pipeline/core/; docs/17
 * §12), so the board and the proposals work on this branch alone. Each keeps its contract
 * (src/lib/pipeline/leads.ts, tasks.ts, staleness.ts, events.ts) and does the least it promises.
 * At the merge the lead points `wiring.ts` and the board at A's operations and deletes this file.
 * Callers have checked the user and the role; these write with access overridden, in the
 * request's transaction.
 */

/** A no-op until A's `emit` joins: nothing listens to the pipeline's events before then. */
export const interimEmit: EmitPipelineEvent = async () => {}

const DAY_MS = 86_400_000

/** Monday to Friday in India, skipping `holidays` (none until I-52 is supplied). */
export const interimAddWorkingDays: AddWorkingDays = (from, days, holidays = []) => {
  const skip = new Set<IstDay>(holidays)
  let at = Date.parse(`${istDay(from)}T00:00:00Z`)
  let counted = 0
  while (counted < days) {
    at += DAY_MS
    const day = new Date(at)
    const weekday = day.getUTCDay()
    if (weekday !== 0 && weekday !== 6 && !skip.has(day.toISOString().slice(0, 10))) counted += 1
  }
  return new Date(at).toISOString().slice(0, 10)
}

const isFinal = (stage: LeadStage) => (FINAL_STAGES as readonly LeadStage[]).includes(stage)

/** P3 and P4 from the lead's own fields (docs/17 §7). */
export const interimHeatOf: HeatOf = (lead, now) => {
  if (isFinal(lead.stage)) return { state: 'fine' }
  if (lead.stage === UNTOUCHED_STAGE) {
    if (lead.touchedAt) return { state: 'fine' }
    const since = new Date(lead.createdAt)
    const hours = (now.getTime() - since.getTime()) / 3_600_000
    if (hours >= UNTOUCHED_HOURS.red) return { state: 'untouched', level: 'red', since }
    if (hours >= UNTOUCHED_HOURS.amber) return { state: 'untouched', level: 'amber', since }
    return { state: 'fine' }
  }
  if (!(STALE_STAGES[lead.kind] as readonly LeadStage[]).includes(lead.stage)) {
    return { state: 'fine' }
  }
  const since = new Date(lead.lastActivityAt ?? lead.stageChangedAt ?? lead.createdAt)
  return now.getTime() - since.getTime() >= STALE_AFTER_DAYS * DAY_MS
    ? { state: 'stale', since }
    : { state: 'fine' }
}

export const interimLogActivity: LogActivity = async (req, input) => {
  const at = input.at ?? new Date()
  const activity = await req.payload.create({
    collection: 'lead-activities',
    data: {
      lead: input.leadId,
      type: input.type,
      at: at.toISOString(),
      body: input.body,
      by: input.by,
      enquiry: input.about?.enquiryId,
      proposalVersion: input.about?.proposalVersionId,
      booking: input.about?.bookingId,
    },
    overrideAccess: true,
    req,
  })
  const lead = await req.payload.findByID({
    collection: 'leads',
    id: input.leadId,
    depth: 0,
    select: { touchedAt: true },
    overrideAccess: true,
    req,
  })
  await req.payload.update({
    collection: 'leads',
    id: input.leadId,
    data: {
      lastActivityAt: at.toISOString(),
      ...(input.by !== null && !lead.touchedAt ? { touchedAt: at.toISOString() } : {}),
    },
    overrideAccess: true,
    req,
  })
  return ok(activity)
}

export const interimCreateTask: CreateTask = async (req, input) => {
  if (input.key) {
    const { docs } = await req.payload.find({
      collection: 'tasks',
      where: { key: { equals: input.key } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
      req,
    })
    if (docs[0]) return ok(docs[0])
  }
  const task = await req.payload.create({
    collection: 'tasks',
    data: {
      kind: input.kind,
      title: input.title,
      status: 'open',
      dueOn: input.dueOn,
      role: input.role,
      assignee: input.assigneeId,
      lead: input.leadId,
      note: input.note,
      automation: input.automation,
      key: input.key,
    },
    overrideAccess: true,
    req,
  })
  return ok(task)
}

export const interimMoveLead: MoveLead = async (req, input) => {
  const lead = await req.payload.findByID({
    collection: 'leads',
    id: input.leadId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  if (!lead) return err({ code: 'not-found' })
  const allowed = STAGE_MOVES[lead.kind][lead.stage] ?? []
  if (!allowed.includes(input.to)) {
    return err({ code: 'bad-move', from: lead.stage, to: input.to })
  }
  const reason = input.reason?.trim()
  if ((REASON_STAGES as readonly LeadStage[]).includes(input.to) && !reason) {
    return err({ code: 'reason-required' })
  }
  const now = new Date().toISOString()
  const moved = await req.payload.update({
    collection: 'leads',
    id: lead.id,
    data: {
      stage: input.to,
      stageChangedAt: now,
      lastActivityAt: now,
      ...(input.by !== null && !lead.touchedAt ? { touchedAt: now } : {}),
      ...(isFinal(input.to) ? { closedAt: now } : {}),
      ...(reason ? { endReason: reason } : {}),
    },
    overrideAccess: true,
    req,
  })
  await req.payload.create({
    collection: 'lead-activities',
    data: {
      lead: lead.id,
      type: 'stageChange',
      at: now,
      by: input.by,
      fromStage: lead.stage,
      toStage: input.to,
    },
    overrideAccess: true,
    req,
  })
  return ok(moved)
}
