/**
 * M6's pipeline tasks (docs/06 P1, P6, P7; docs/19 §5), named by their automation IDs
 * (src/lib/automations/catalogue.ts). Pure, so the jobs config can list them without loading the
 * server-only runners (run.ts), which each task loads when it runs.
 */
export const PIPELINE_TASKS = [
  { slug: 'P1-team-map-ack', label: 'P1 · Team Map request acknowledged' },
  { slug: 'P6-proposal-follow-up', label: 'P6 · Proposal unanswered: follow-up task' },
  { slug: 'P7-partnership-ack', label: 'P7 · Partnership enquiry acknowledged' },
] as const
