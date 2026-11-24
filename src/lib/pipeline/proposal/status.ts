import { istDay } from '@/lib/time/ist'
import type { Proposal, ProposalVersion } from '@/payload-types'

import { STAGES_BY_KIND, type LeadKind, type LeadStage, PROPOSAL_SENT_STAGE } from '../stages'
import { PROPOSAL_MOVES, type ProposalStatus } from '../values'

/**
 * A proposal's statuses and its link's state (docs/17 §5), as pure rules over the stored fields.
 */

export function canMove(from: ProposalStatus, to: ProposalStatus): boolean {
  return PROPOSAL_MOVES[from].includes(to)
}

/**
 * Whether a sent or viewed proposal is past its "valid until" day (the last day it stands, in
 * India) at `now`. Without a day it never expires: there is no default validity.
 */
export function isPastValidity(
  proposal: Pick<Proposal, 'status' | 'validUntil'>,
  now: Date,
): boolean {
  if (proposal.status !== 'sent' && proposal.status !== 'viewed') return false
  if (!proposal.validUntil) return false
  return istDay(now) > proposal.validUntil
}

const idOf = (value: number | { id: number } | null | undefined) =>
  typeof value === 'object' && value !== null ? value.id : (value ?? null)

/**
 * Whether a version's tracked link opens: it is the version the client holds (not replaced by a
 * later send, not withdrawn), and the proposal is not declined or expired. While the office
 * revises a sent proposal (draft again), the client's link keeps working until the new version
 * is sent (docs/17 §5). An accepted proposal's link stays open.
 */
export function linkOpens(
  proposal: Pick<Proposal, 'status' | 'sentVersion'>,
  version: Pick<ProposalVersion, 'id' | 'sending'>,
): boolean {
  if (idOf(proposal.sentVersion) !== version.id) return false
  if (version.sending?.supersededAt || version.sending?.linkRevokedAt) return false
  if (!version.sending?.sentAt) return false
  return (
    proposal.status === 'sent' ||
    proposal.status === 'viewed' ||
    proposal.status === 'accepted' ||
    proposal.status === 'draft'
  )
}

/** Whether a sent proposal should bring its lead to Proposal sent: a consultancy lead, earlier. */
export function leadMovesOnSend(lead: { kind: LeadKind; stage: LeadStage }): boolean {
  if (lead.kind !== 'consultancy') return false
  const order: readonly LeadStage[] = STAGES_BY_KIND.consultancy
  const at = order.indexOf(lead.stage)
  return at >= 0 && at < order.indexOf(PROPOSAL_SENT_STAGE)
}

export { idOf }
