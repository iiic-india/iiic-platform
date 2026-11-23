import type { PayloadRequest } from 'payload'

import { interimHeatOf } from '@/lib/pipeline/proposal/interim'
import {
  FINAL_STAGES,
  LEAD_STAGES,
  type LeadKind,
  type LeadStage,
  STAGE_MOVES,
  STAGES_BY_KIND,
} from '@/lib/pipeline/stages'
import type { HeatOf, LeadHeat } from '@/lib/pipeline/staleness'
import type { Lead } from '@/payload-types'

/**
 * The Pipeline board's data (docs/05 Pipeline; docs/17 §3, §7, §12 C): one board per kind, a
 * column per stage in STAGES_BY_KIND's order, each lead's heat worked out from its own fields as
 * it is read (`HeatOf`), and the "Needs attention" list of the untouched and the stale. Leads are
 * read with the user's own access; nothing about the contact person is read at all.
 *
 * At the merge (the lead): `heatOf` comes from builder A's src/lib/pipeline/core/heat.ts in place
 * of the interim stand-in.
 */

export const ACTIVE_LIMIT = 300
export const FINAL_LIMIT = 20

/** What a card shows: the lead's own fields, its organisation's name and its owner's. */
export type BoardLead = Pick<
  Lead,
  | 'id'
  | 'title'
  | 'kind'
  | 'stage'
  | 'createdAt'
  | 'touchedAt'
  | 'stageChangedAt'
  | 'lastActivityAt'
  | 'closedAt'
  | 'nextAction'
  | 'dueOn'
> & { organisationName: string | null; ownerName: string | null }

export type BoardCard = BoardLead & { heat: LeadHeat; moves: readonly LeadStage[] }

export type BoardColumn = {
  stage: LeadStage
  label: string
  final: boolean
  cards: BoardCard[]
}

export type Board = {
  kind: LeadKind
  columns: BoardColumn[]
  attention: BoardCard[]
  /** More active leads than the board shows. */
  truncated: boolean
}

const LABELS = Object.fromEntries(LEAD_STAGES.map(({ value, label }) => [value, label])) as Record<
  LeadStage,
  string
>

export const stageLabel = (stage: LeadStage): string => LABELS[stage]

const isFinal = (stage: LeadStage) => (FINAL_STAGES as readonly LeadStage[]).includes(stage)

/** The most urgent first: red, then amber, then stale; the longest waiting first within each. */
function urgency(heat: LeadHeat): number {
  if (heat.state === 'untouched') return heat.level === 'red' ? 0 : 1
  return heat.state === 'stale' ? 2 : 3
}

/** The board from the leads read (pure; tests/unit/pipelineBoard.spec.ts). */
export function buildBoard(
  kind: LeadKind,
  leads: BoardLead[],
  now: Date,
  heatOf: HeatOf,
  truncated = false,
): Board {
  const cards: BoardCard[] = leads
    .filter((lead) => lead.kind === kind)
    .map((lead) => ({
      ...lead,
      heat: heatOf(lead, now),
      moves: STAGE_MOVES[kind][lead.stage] ?? [],
    }))
  const columns = STAGES_BY_KIND[kind].map((stage) => ({
    stage,
    label: stageLabel(stage),
    final: isFinal(stage),
    cards: cards.filter((card) => card.stage === stage),
  }))
  const attention = cards
    .filter((card) => card.heat.state !== 'fine')
    .sort((a, b) => {
      const order = urgency(a.heat) - urgency(b.heat)
      if (order !== 0) return order
      const since = (card: BoardCard) => ('since' in card.heat ? card.heat.since.getTime() : 0)
      return since(a) - since(b)
    })
  return { kind, columns, attention, truncated }
}

const LEAD_SELECT = {
  title: true,
  kind: true,
  stage: true,
  createdAt: true,
  touchedAt: true,
  stageChangedAt: true,
  lastActivityAt: true,
  closedAt: true,
  nextAction: true,
  dueOn: true,
  organisation: true,
  owner: true,
} as const

type ReadLead = Pick<Lead, keyof typeof LEAD_SELECT | 'id'>

const idOf = (value: number | { id: number } | null | undefined): number | null =>
  value === null || value === undefined ? null : typeof value === 'number' ? value : value.id

/**
 * Reads one board with the user's own access (owner or operator; the view has checked). The
 * active stages in one read, each final stage's most recent few in another. Staff names are
 * read for the owners shown, and nothing else about them.
 */
export async function loadBoard(
  req: PayloadRequest,
  kind: LeadKind,
  now: Date,
  heatOf: HeatOf = interimHeatOf,
): Promise<Board> {
  const stages: readonly LeadStage[] = STAGES_BY_KIND[kind]
  const active = stages.filter((stage) => !isFinal(stage))
  const finals = stages.filter(isFinal)
  const common = {
    collection: 'leads' as const,
    depth: 1,
    select: LEAD_SELECT,
    populate: { organisations: { name: true } },
    overrideAccess: false,
    req,
  }
  const open = await req.payload.find({
    ...common,
    where: { and: [{ kind: { equals: kind } }, { stage: { in: active } }] },
    sort: 'createdAt',
    limit: ACTIVE_LIMIT,
  })
  const ended = await Promise.all(
    finals.map((stage) =>
      req.payload.find({
        ...common,
        where: { and: [{ kind: { equals: kind } }, { stage: { equals: stage } }] },
        sort: '-closedAt',
        limit: FINAL_LIMIT,
      }),
    ),
  )
  const read = [...open.docs, ...ended.flatMap((page) => page.docs)] as ReadLead[]

  const ownerIds = [...new Set(read.map((lead) => idOf(lead.owner)).filter((id) => id !== null))]
  const names = new Map<number, string>()
  if (ownerIds.length > 0) {
    const { docs } = await req.payload.find({
      collection: 'users',
      where: { id: { in: ownerIds } },
      select: { name: true },
      depth: 0,
      limit: ownerIds.length,
      overrideAccess: true,
      req,
    })
    for (const user of docs) names.set(user.id, user.name)
  }

  const leads: BoardLead[] = read.map((lead) => {
    const organisation = lead.organisation
    const ownerId = idOf(lead.owner)
    return {
      id: lead.id,
      title: lead.title,
      kind: lead.kind,
      stage: lead.stage,
      createdAt: lead.createdAt,
      touchedAt: lead.touchedAt,
      stageChangedAt: lead.stageChangedAt,
      lastActivityAt: lead.lastActivityAt,
      closedAt: lead.closedAt,
      nextAction: lead.nextAction,
      dueOn: lead.dueOn,
      organisationName:
        organisation && typeof organisation === 'object' ? (organisation.name ?? null) : null,
      ownerName: ownerId === null ? null : (names.get(ownerId) ?? null),
    }
  })
  return buildBoard(kind, leads, now, heatOf, open.totalDocs > open.docs.length)
}
