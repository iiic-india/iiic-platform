import type { DomainEventName } from '@/lib/booking/events'

/**
 * The CRM's jobs (src/jobs/pipeline.ts), by their automation IDs (docs/06; docs/17 §8): a
 * proposal call booked put on its lead (P2), and the untouched and stale alerts (P3, P4).
 */
export const PIPELINE_TASKS = {
  leadFromCall: 'P2-lead-from-call',
  leadAlerts: 'P3-P4-lead-alerts',
} as const

/**
 * M3's domain events the CRM listens to, for the booking module's emit (src/lib/booking/emit.ts):
 * a confirmed booking queues P2, which reads only the booking's kind of anything that is not a
 * proposal call and leaves it alone (CLAUDE.md #3).
 */
export const PIPELINE_SUBSCRIPTIONS = {
  'booking.confirmed': PIPELINE_TASKS.leadFromCall,
} as const satisfies Partial<Record<DomainEventName, string>>
