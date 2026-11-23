/**
 * A lead's kinds and stages, and the moves between them (docs/03 F5 and F12; docs/05 Pipeline;
 * docs/17-pipeline-design.md §3). The collection's select options and the board's columns are
 * built from these lists, so a stage is added here and nowhere else. Who may make a move, and
 * what a move does besides (an activity, an event), is the CRM builder's; this file holds the
 * vocabulary and the table of allowed moves only.
 */

export const LEAD_KINDS = [
  { value: 'consultancy', label: 'Consultancy' },
  { value: 'partnership', label: 'Partnership' },
] as const

export type LeadKind = (typeof LEAD_KINDS)[number]['value']

/** Every stage of either board, in one select. Labels are the docs' words. */
export const LEAD_STAGES = [
  // Both boards start here (docs/03 F5 step 3, F12).
  { value: 'new', label: 'New' },
  // Consultancy (docs/03 F5 step 4; docs/05 Pipeline).
  { value: 'contacted', label: 'Contacted' },
  { value: 'teamMapScheduled', label: 'Team Map scheduled' },
  { value: 'teamMapDone', label: 'Team Map done' },
  { value: 'debriefHeld', label: 'Debrief held' },
  { value: 'proposalSent', label: 'Proposal sent' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  // Partnerships (docs/03 F12).
  { value: 'inConversation', label: 'In conversation' },
  { value: 'mouDrafted', label: 'MoU drafted' },
  { value: 'signed', label: 'Signed' },
  // A partnership that ends without an agreement. Proposed (docs/17 §10): F12's list has no
  // end but "Signed".
  { value: 'closed', label: 'Closed' },
] as const

export type LeadStage = (typeof LEAD_STAGES)[number]['value']

/** Each board's columns, in order: the active stages first, then the final ones. */
export const STAGES_BY_KIND = {
  consultancy: [
    'new',
    'contacted',
    'teamMapScheduled',
    'teamMapDone',
    'debriefHeld',
    'proposalSent',
    'won',
    'lost',
  ],
  partnership: ['new', 'inConversation', 'mouDrafted', 'signed', 'closed'],
} as const satisfies Record<LeadKind, readonly LeadStage[]>

/** Where a lead ends. A final stage moves nowhere; a repeat enquiry opens a new lead. */
export const FINAL_STAGES = [
  'won',
  'lost',
  'signed',
  'closed',
] as const satisfies readonly LeadStage[]

/** The final stages that need a reason (docs/03 F5: "Lost (reason)"). */
export const REASON_STAGES = ['lost', 'closed'] as const satisfies readonly LeadStage[]

/**
 * Where the first-reply clock runs (P3: amber after 24 hours, red after 48), until someone on the
 * staff first acts on the lead.
 */
export const UNTOUCHED_STAGE = 'new' as const satisfies LeadStage

/**
 * The stages a lead can go stale in (P4: an active-stage lead with no activity for seven days).
 * New is watched by P3 instead.
 */
export const STALE_STAGES = {
  consultancy: ['contacted', 'teamMapScheduled', 'teamMapDone', 'debriefHeld', 'proposalSent'],
  partnership: ['inConversation', 'mouDrafted'],
} as const satisfies Record<LeadKind, readonly LeadStage[]>

/** The stage a booked proposal call brings a consultancy lead to, if it is earlier (P2). */
export const CALL_STAGE = 'contacted' as const satisfies LeadStage

/** The stage a sent proposal brings a consultancy lead to, if it is earlier (P5). */
export const PROPOSAL_SENT_STAGE = 'proposalSent' as const satisfies LeadStage

type Moves = Readonly<Partial<Record<LeadStage, readonly LeadStage[]>>>

const isFinal = (stage: LeadStage) => (FINAL_STAGES as readonly LeadStage[]).includes(stage)

function movesOn(kind: LeadKind): Moves {
  const stages: readonly LeadStage[] = STAGES_BY_KIND[kind]
  const moves: Partial<Record<LeadStage, readonly LeadStage[]>> = {}
  for (const from of stages) moves[from] = isFinal(from) ? [] : stages.filter((to) => to !== from)
  return moves
}

/**
 * The allowed moves, per kind: an active stage may move to any other stage of its own board,
 * forwards, backwards (the office corrects a slip) or to an end; a final stage moves nowhere.
 * Proposed (docs/17 §3): the docs give the order, not the moves.
 */
export const STAGE_MOVES: Readonly<Record<LeadKind, Moves>> = {
  consultancy: movesOn('consultancy'),
  partnership: movesOn('partnership'),
}
