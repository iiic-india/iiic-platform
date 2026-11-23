import type { JobsConfig } from 'payload'

/**
 * Builder C's tasks (docs/19 §5, §9), named by the catalogue (src/lib/automations/catalogue.ts):
 * the digests and reports (`O1-daily-digest`, `O2-weekly-report` with O10), `O5-retention`,
 * `O6-backup-check`, `O9-bounce-complaint`, the reviews (`V1-review-consent-request`,
 * `V2-withdrawal-confirmation`), `C5-certificate-email`, the privacy timers (`O4-data-request`,
 * `O7-complaint`, `O8-incident-timers`) and the pipeline (`P1-team-map-ack`, `P2-call-booked`,
 * `P3-P4-lead-ages`, `P5-proposal-sent`, `P6-proposal-follow-up`, `P7-partnership-ack`). The
 * newsletter's are in newsletter.ts.
 */
export const operationsTasks: NonNullable<JobsConfig['tasks']> = []
