import type { PayloadRequest } from 'payload'

import type { LeadKind, LeadStage } from './stages'
import type { EnquiryKind, EnquiryOutcome, LeadSource, UntouchedLevel } from './values'

/**
 * The domain events the pipeline raises (docs/17 §8; docs/06, Engine rules), for M5's Today and
 * M6's messages and digest. They follow M3's rules (src/lib/booking/events.ts, docs/16 §9): ids
 * and plain codes only, never a name, a contact detail, a note or an amount; each queues its
 * listeners' jobs inside the change's own transaction, with an idempotency key, so a rolled-back
 * change queues nothing and a retry queues nothing new.
 *
 * M4 subscribes one task of its own, at the merge: M3's `booking.confirmed` queues
 * `P2-lead-from-call`. The proposal email goes from the send itself, because the link's token
 * exists only there (src/lib/pipeline/proposals.ts, SendVersion). Every other subscription is
 * M6's (P1 and P7's acknowledgements, P3 and P4 on Today and in the digest, P6's drafted
 * follow-up).
 */
export type PipelineEvent =
  /** A public form's request stored, with its lead (P1, P7: the acknowledgement, M6). */
  | {
      name: 'enquiry.received'
      enquiryId: number
      leadId: number
      kind: EnquiryKind
      outcome: EnquiryOutcome
    }
  /** A lead made, by a form, a booked call or the office (Today, the digest). */
  | { name: 'lead.created'; leadId: number; kind: LeadKind; source: LeadSource }
  /** A lead moved; the activity that records it is the key. */
  | {
      name: 'lead.stageChanged'
      leadId: number
      activityId: number
      from: LeadStage
      to: LeadStage
    }
  /** A lead still in New with no one acting on it past 24 or 48 hours (P3). */
  | { name: 'lead.untouched'; leadId: number; level: UntouchedLevel }
  /** An active lead with no activity for seven days; `since` is its last activity (P4). */
  | { name: 'lead.stale'; leadId: number; since: string }
  /** A task made for a person (Today, M5). */
  | { name: 'task.created'; taskId: number }
  /** A proposal frozen as a new version. */
  | { name: 'proposal.versionCreated'; proposalId: number; versionId: number }
  /** A version sent with its tracked link (P5; Today; P6 counts from it, M6). */
  | { name: 'proposal.sent'; proposalId: number; versionId: number }
  /** A sent version opened for the first time through its link. */
  | { name: 'proposal.viewed'; proposalId: number; versionId: number }
  /** What the client said, recorded by the office; or its "valid until" day passed (P8). */
  | { name: 'proposal.accepted'; proposalId: number }
  | { name: 'proposal.declined'; proposalId: number }
  | { name: 'proposal.expired'; proposalId: number }

export type PipelineEventName = PipelineEvent['name']

/**
 * The idempotency key of an event's jobs: `<event>:<subject>`, where the subject is the id the
 * event is about, and for a repeatable event what makes this one different (the stage change's
 * activity, the untouched level, the quiet spell's last activity).
 */
export type PipelineEventKey = (event: PipelineEvent) => string

/** Queues the event's listeners inside the request's transaction (builder A: `emit.ts`). */
export type EmitPipelineEvent = (req: PayloadRequest, event: PipelineEvent) => Promise<void>
