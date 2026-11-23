import type { PayloadRequest } from 'payload'

import type { Lead, Proposal, ProposalVersion } from '@/payload-types'

import { idOf } from './status'

/**
 * Reads for the proposal actions, after their checks (access overridden, in the request's
 * transaction). Each answers null for a missing record rather than throwing.
 */

export async function findProposal(req: PayloadRequest, id: number): Promise<Proposal | null> {
  return req.payload.findByID({
    collection: 'proposals',
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
}

export async function findVersion(
  req: PayloadRequest,
  id: number,
  { withTokenHash = false }: { withTokenHash?: boolean } = {},
): Promise<ProposalVersion | null> {
  return req.payload.findByID({
    collection: 'proposal-versions',
    id,
    depth: 0,
    disableErrors: true,
    showHiddenFields: withTokenHash,
    overrideAccess: true,
    req,
  })
}

export async function findLead(req: PayloadRequest, proposal: Proposal): Promise<Lead | null> {
  const id = idOf(proposal.lead)
  if (id === null) return null
  return req.payload.findByID({
    collection: 'leads',
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
}

/** The client's name the proposal prints: the lead's organisation's, as the office keeps it. */
export async function clientNameOf(req: PayloadRequest, lead: Lead | null): Promise<string | null> {
  const id = idOf(lead?.organisation)
  if (id === null) return null
  const organisation = await req.payload.findByID({
    collection: 'organisations',
    id,
    depth: 0,
    disableErrors: true,
    select: { name: true },
    overrideAccess: true,
    req,
  })
  const name = organisation?.name?.trim()
  return name ? name : null
}

/** The lead's contact and their email address, where the proposal goes. */
export async function recipientOf(
  req: PayloadRequest,
  lead: Lead | null,
): Promise<{ personId: number; email: string } | null> {
  const id = idOf(lead?.person)
  if (id === null) return null
  const person = await req.payload.findByID({
    collection: 'people',
    id,
    depth: 0,
    disableErrors: true,
    select: { email: true },
    overrideAccess: true,
    req,
  })
  const email = person?.email?.trim()
  return person && email ? { personId: person.id, email } : null
}

/** The latest version's number for a proposal, or 0 before the first. */
export async function lastVersionNumber(req: PayloadRequest, proposalId: number): Promise<number> {
  const { docs } = await req.payload.find({
    collection: 'proposal-versions',
    where: { proposal: { equals: proposalId } },
    sort: '-number',
    limit: 1,
    depth: 0,
    select: { number: true },
    overrideAccess: true,
    req,
  })
  return docs[0]?.number ?? 0
}
