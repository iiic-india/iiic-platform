import type { PayloadRequest } from 'payload'

import type { Result } from '@/lib/result'
import type { Lead, LeadActivity } from '@/payload-types'

import type { PartnershipEnquiry, TeamMapRequest } from './forms'
import type { LeadStage } from './stages'
import type { ActivityType, EnquiryOutcome } from './values'

/**
 * The CRM's operations (docs/17 §3–§4), as contracts: builder A implements each on the server
 * ('server-only'), inside the request's transaction, and returns a typed Result. None logs a
 * name, a contact detail or a note.
 */

/** Why a CRM operation said no. Each code is a plain answer the caller can explain. */
export type PipelineError =
  | { code: 'not-found' }
  | { code: 'not-allowed' } // the user's role, or a session without its two-factor code
  | { code: 'bad-move'; from: LeadStage; to: LeadStage } // not in STAGE_MOVES
  | { code: 'reason-required' } // lost or closed without a reason
  | { code: 'no-notice' } // no consent text in force for the purpose (the form is not shown)
  | { code: 'notice-changed' } // the notice the form showed is not the one in force

/** What the form's action knows besides the fields (docs/17 §6): never the person's words. */
export type EnquiryContext = {
  /** The page the form was on, such as /organisations/team-map. */
  page: string
  utm: Partial<Record<'source' | 'medium' | 'campaign' | 'term' | 'content', string>>
  /** For the consent's evidence (docs/04 `consents.evidence`): kept with the consent only. */
  evidence: { ip: string | null; userAgent: string | null; form: string }
  /** The daily keyed hash of the network address, for the rate limits (docs/17 §6). */
  submitterHash: string
  turnstile: 'passed' | 'off'
  receivedAt: Date
}

export type ReceivedEnquiry =
  | { kind: 'teamMap'; fields: TeamMapRequest; context: EnquiryContext }
  | { kind: 'partnership'; fields: PartnershipEnquiry; context: EnquiryContext }

/**
 * Stores a request from a public form and puts it on its board (P1, P7; docs/17 §4), all in one
 * transaction, in this order: the person (matched by email, then mobile, or made; an existing
 * record is never changed), the consent for `enquiryReplies` under the notice version the form
 * showed (refused unless it is the one in force), then the organisation (matched or made), the
 * enquiry with the fields as typed and the consent's id, the lead (the open lead of the same
 * kind it matches, else a new one in New), an `enquiry` activity, and, unless the lead already
 * has an open first-reply task, a task for the operator due in two working days. Emits
 * `enquiry.received`, and `lead.created` and `task.created` for what it made. Nothing is stored
 * unless all of it is.
 */
export type ReceiveEnquiry = (
  req: PayloadRequest,
  input: ReceivedEnquiry,
) => Promise<Result<{ enquiryId: number; leadId: number; outcome: EnquiryOutcome }, PipelineError>>

/**
 * Moves a lead along STAGE_MOVES (the board's "Move to stage", the lead's own form): records a
 * `stageChange` activity, sets `stageChangedAt`, `closedAt` on a final stage, and emits
 * `lead.stageChanged`. Lost and closed need `reason`. Staff only (owner or operator, with the
 * code); the platform's own moves (P2, P5) pass `by: null`.
 */
export type MoveLead = (
  req: PayloadRequest,
  input: { leadId: number; to: LeadStage; reason?: string; by: number | null },
) => Promise<Result<Lead, PipelineError>>

/**
 * Adds an entry to a lead's timeline and keeps the lead's `lastActivityAt` (and `touchedAt` for
 * a staff entry). Staff write only STAFF_ACTIVITY_TYPES; the other types are the platform's.
 */
export type LogActivity = (
  req: PayloadRequest,
  input: {
    leadId: number
    type: ActivityType
    body?: string
    at?: Date
    by: number | null
    about?: { enquiryId?: number; proposalVersionId?: number; bookingId?: number }
  },
) => Promise<Result<LeadActivity, PipelineError>>

/**
 * A proposal call booked through the booking flow (P2, on `booking.confirmed` for a `call`):
 * finds or makes the person's organisation from the call's company details and its open
 * consultancy lead, or makes one (source `proposalCall`), attaches the booking, moves the lead to
 * Contacted if it is earlier, and logs a `booking` activity. Idempotent per booking.
 */
export type AttachCall = (
  req: PayloadRequest,
  input: { bookingId: number },
) => Promise<Result<{ leadId: number; created: boolean }, PipelineError>>
