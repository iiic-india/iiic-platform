import { done, type Outcome } from '@/lib/automations/operations/outcome'

/**
 * M5's automations of builder C (docs/06 O4, O7, O8, C5; docs/19 §5), registered now against
 * `dataRequest.received`, `incident.opened` and `certificate.issued`, which M5 will raise. They
 * read M5's data requests, incidents and certificates, which do not exist yet: until M5 lands,
 * each answers `waits-on-M5` and plans nothing. Their templates (`data-request-ack`,
 * `complaint-ack`, `privacy-deadline`, `incident-alert`, `certificate-issued`) are written with
 * M5's fields; the deadlines (50% and 80%; 24 h; 4, 6, 48 and 72 h) are docs/06's.
 */
export const WAITS_ON_M5 = 'waits-on-M5'

export async function runPrivacyWaiting(): Promise<Outcome> {
  return done(0, WAITS_ON_M5)
}

export const PRIVACY_TASKS = [
  { slug: 'O4-data-request', label: 'O4 · Data request: acknowledgement and deadline reminders' },
  { slug: 'O7-complaint', label: 'O7 · Complaint or grievance: acknowledgement and reminders' },
  { slug: 'O8-incident-timers', label: 'O8 · Incident timers' },
  { slug: 'C5-certificate-email', label: 'C5 · Certificate issued: the certificate email' },
] as const
