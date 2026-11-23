/**
 * The breach register's clocks and states (docs/04 `incidents`; docs/05, Privacy; docs/08 §3,
 * the runbook's breach response; docs/18 §5). Both clocks run from the moment the incident was
 * detected: a listed incident is reported to CERT-In within 6 hours (CERT-In Directions, 2022);
 * the Data Protection Board receives the detailed report within 72 hours (DPDP Rules, from 13 May
 * 2027), and the affected people are told without delay. Builder A keeps the register's moves and
 * Today's timers on these.
 */

export const CERT_IN_WITHIN_HOURS = 6

export const BOARD_REPORT_WITHIN_HOURS = 72

export const INCIDENT_STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'contained', label: 'Contained' },
  { value: 'closed', label: 'Closed' },
] as const

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number]['value']

/** The two deadlines of an incident (pure; builder A implements it). */
export type IncidentClocks = (detectedAt: Date) => { certInBy: Date; boardBy: Date }

/** One clock on Today and in the register: how long is left, or how late it is. */
export type ClockState =
  | { state: 'done'; at: Date }
  | { state: 'running'; dueAt: Date; hoursLeft: number }
  | { state: 'overdue'; dueAt: Date; hoursLate: number }
  | { state: 'not-applicable' }
