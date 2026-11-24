import type { JobsConfig } from 'payload'

import { PIPELINE_TASKS } from '@/lib/automations/pipeline'
import { PRIVACY_TASKS } from '@/lib/automations/privacy'

import { cTask, type Run } from './cTasks'

/**
 * Builder C's tasks (docs/19 §5, §9), named by the catalogue (src/lib/automations/catalogue.ts):
 * the digests and reports (`O1-daily-digest`, `O2-weekly-report` with O10), `O5-retention`,
 * `O6-backup-check`, `O9-bounce-complaint`, the reviews (`V1-review-consent-request`,
 * `V2-withdrawal-confirmation`), the pipeline's on M4's records (`P1-team-map-ack` and
 * `P7-partnership-ack` on `enquiry.received`, `P6-proposal-follow-up` each morning), and,
 * registered against their events before M5 lands, `C5-certificate-email` and the privacy timers
 * (`O4-data-request`, `O7-complaint`, `O8-incident-timers`), which answer `waits-on-M5` until
 * then. The schedules are in src/lib/automations/schedules.ts. The newsletter's tasks are in
 * newsletter.ts.
 */
const operations = () => import('@/lib/automations/operations/run')
const reviews = () => import('@/lib/automations/reviews')
const pipeline = () => import('@/lib/automations/pipeline/run')

const PIPELINE_RUNS: Record<(typeof PIPELINE_TASKS)[number]['slug'], Run> = {
  'P1-team-map-ack': (req, input, now) => pipeline().then(({ runP1 }) => runP1(req, input, now)),
  'P6-proposal-follow-up': (req, _input, now) => pipeline().then(({ runP6 }) => runP6(req, now)),
  'P7-partnership-ack': (req, input, now) => pipeline().then(({ runP7 }) => runP7(req, input, now)),
}

export const operationsTasks: NonNullable<JobsConfig['tasks']> = [
  cTask('O1-daily-digest', 'O1 · Daily digest', async () => {
    const { runO1 } = await operations()
    return (req, _input, now) => runO1(req, now)
  }),
  cTask('O2-weekly-report', 'O2, O10 · Weekly report', async () => {
    const { runO2 } = await operations()
    return (req, _input, now) => runO2(req, now)
  }),
  cTask('O5-retention', 'O5 · Retention: lapsed signups, old message log', async () => {
    const { runO5 } = await operations()
    return (req, _input, now) => runO5(req, now)
  }),
  cTask('O6-backup-check', 'O6 · Backup check', async () => {
    const { runO6 } = await operations()
    return () => runO6()
  }),
  cTask('O9-bounce-complaint', 'O9 · Hard bounce or complaint: address marked', async () => {
    const { runO9 } = await operations()
    return (req, input) => runO9(req, input)
  }),
  cTask(
    'V1-review-consent-request',
    'V1 · Consent request for a review, and one reminder',
    async () => (await reviews()).runV1,
  ),
  cTask(
    'V2-withdrawal-confirmation',
    'V2 · Consent to publish withdrawn: confirmation',
    async () => (await reviews()).runV2,
  ),
  ...PIPELINE_TASKS.map(({ slug, label }) => cTask(slug, label, async () => PIPELINE_RUNS[slug])),
  ...PRIVACY_TASKS.map(({ slug, label }) =>
    cTask(slug, label, async () => {
      const { runPrivacyWaiting } = await import('@/lib/automations/privacy')
      return () => runPrivacyWaiting()
    }),
  ),
]
