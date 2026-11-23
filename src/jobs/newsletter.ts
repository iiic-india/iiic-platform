import type { JobsConfig } from 'payload'

/**
 * Builder C's newsletter tasks (docs/19 §8; D-10): `N1-confirm-signup`, `N2-welcome`,
 * `N3-unsubscribe` and `N4-send-issue`.
 */
export const newsletterTasks: NonNullable<JobsConfig['tasks']> = []
