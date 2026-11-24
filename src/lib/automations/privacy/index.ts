/**
 * M6's automations on M5's records (docs/06 O4, O7, O8, C5; docs/19 §5), named by their
 * automation IDs: `dataRequest.received` (O4, O7), `incident.opened` (O8) and
 * `certificate.issued` (C5). Pure, so the jobs config lists them without loading the
 * server-only runners (run.ts), which each task loads when it runs.
 */
export const PRIVACY_TASKS = [
  { slug: 'O4-data-request', label: 'O4 · Data request: acknowledgement and deadline reminders' },
  { slug: 'O7-complaint', label: 'O7 · Complaint or grievance: acknowledgement and reminders' },
  { slug: 'O8-incident-timers', label: 'O8 · Incident timers' },
  { slug: 'C5-certificate-email', label: 'C5 · Certificate issued: the certificate email' },
] as const
