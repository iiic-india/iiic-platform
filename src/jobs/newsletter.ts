import type { JobsConfig } from 'payload'

import { cTask } from './cTasks'

/**
 * Builder C's newsletter tasks (docs/19 §8; D-10): `N1-confirm-signup`, `N2-welcome`,
 * `N3-unsubscribe` and `N4-send-issue`, started by the events the catalogue names
 * (src/lib/automations/catalogue.ts). The logic is in src/lib/newsletter/automations.ts.
 */
const newsletter = () => import('@/lib/newsletter/automations')

export const newsletterTasks: NonNullable<JobsConfig['tasks']> = [
  cTask('N1-confirm-signup', 'N1 · Double opt-in email', async () => (await newsletter()).runN1),
  cTask('N2-welcome', 'N2 · Confirmed: welcome email', async () => (await newsletter()).runN2),
  cTask(
    'N3-unsubscribe',
    'N3 · Unsubscribe or complaint: off the list',
    async () => (await newsletter()).runN3,
  ),
  cTask('N4-send-issue', 'N4 · Send an issue at its time', async () => (await newsletter()).runN4),
]
