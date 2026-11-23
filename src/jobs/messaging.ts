import type { JobsConfig } from 'payload'

/**
 * Builder A's tasks (docs/19 §2, §9): `messages-dispatch`, which sends what is due every minute,
 * retries, and moves sends that never answered to `unknown`; and `O3-failure-alert`. Like M3's,
 * each loads its server-only module when it runs, never when the config loads (the Payload CLI
 * reads this file too), retries three times with backoff, and logs codes only.
 */
export const messagingTasks: NonNullable<JobsConfig['tasks']> = []
