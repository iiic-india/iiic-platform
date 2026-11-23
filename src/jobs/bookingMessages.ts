import type { JobsConfig } from 'payload'

/**
 * Builder B's tasks (docs/19 §5, §9): the booking and payment messages, one task per automation,
 * named by its ID as the catalogue gives it (src/lib/automations/catalogue.ts: `B2-confirmation`,
 * `B3-receipt`, `B3a-consent-receipt`, `B5-reminder-24h`, `B6-reminder-2h`, `B7-change-notice`,
 * `B8-feedback-request`, `B9-no-show`, `B10-slot-lost`, `B12-time-request-ack`,
 * `B13-payment-link`). Each reads the event's ids, decides, and asks the core to deliver.
 */
export const bookingMessageTasks: NonNullable<JobsConfig['tasks']> = []
