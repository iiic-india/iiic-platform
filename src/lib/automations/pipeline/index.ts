import { done, type Outcome } from '@/lib/automations/operations/outcome'

/**
 * The pipeline's automations (docs/06 P1 to P7; docs/19 §5), registered now against the events
 * and schedules the design names (`lead.created`, `booking.confirmed` for P2, `proposal.sent`, the
 * hourly and daily checks) so the wiring is in place before M4. They read M4's `leads`,
 * `proposals` and activities, which do not exist yet: until M4 lands, each answers
 * `waits-on-M4` and plans nothing. The acknowledgement templates (`team-map-ack`,
 * `partnership-ack`, `proposal-sent`) are written with M4's fields.
 */
export const WAITS_ON_M4 = 'waits-on-M4'

export async function runPipelineWaiting(): Promise<Outcome> {
  return done(0, WAITS_ON_M4)
}

/** The pipeline's tasks, named by their automation IDs (src/lib/automations/catalogue.ts). */
export const PIPELINE_TASKS = [
  { slug: 'P1-team-map-ack', label: 'P1 · Team Map request: acknowledgement, lead and task' },
  { slug: 'P2-call-booked', label: 'P2 · Proposal call booked: lead moved to Contacted' },
  { slug: 'P3-P4-lead-ages', label: 'P3, P4 · Lead ages: amber, red and stale' },
  { slug: 'P5-proposal-sent', label: 'P5 · Proposal sent: follow-up task' },
  { slug: 'P6-proposal-follow-up', label: 'P6 · Proposal unanswered: draft follow-up' },
  { slug: 'P7-partnership-ack', label: 'P7 · Partnership enquiry acknowledged' },
] as const
