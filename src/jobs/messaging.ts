import type { JobsConfig, TaskConfig } from 'payload'

import { CORE_TASKS } from '@/lib/automations/catalogue'
import { onFail, TASK_RETRIES } from '@/lib/automations/failures'

/**
 * Builder A's tasks (docs/19 §2, §9): `messages-dispatch`, which sends what is due every minute,
 * retries, and moves sends that never answered to `unknown`; and `O3-failure-alert`. Like M3's,
 * each loads its server-only module when it runs, never when the config loads (the Payload CLI
 * reads this file too), retries three times with backoff, and logs codes only.
 */

/** How many due messages one dispatch tries; the next minute takes the rest. */
export const DISPATCH_BATCH = 50

export const dispatchTask: TaskConfig<{
  input: object
  output: {
    sent: number
    deferred: number
    skipped: number
    failed: number
    retried: number
    unknown: number
  }
}> = {
  slug: CORE_TASKS.dispatch,
  label: 'Messages · send what is due',
  // One dispatcher at a time, even when two cron calls overlap (docs/19 §2).
  concurrency: () => CORE_TASKS.dispatch,
  retries: TASK_RETRIES,
  outputSchema: [
    { name: 'sent', type: 'number', required: true },
    { name: 'deferred', type: 'number', required: true },
    { name: 'skipped', type: 'number', required: true },
    { name: 'failed', type: 'number', required: true },
    { name: 'retried', type: 'number', required: true },
    { name: 'unknown', type: 'number', required: true },
  ],
  handler: async ({ req }) => {
    const { dispatch } = await import('@/lib/messaging/dispatch')
    return { output: await dispatch(req, new Date(), DISPATCH_BATCH) }
  },
  onFail: (args) => onFail(args),
}

export const failureAlertTask: TaskConfig<{
  input: { name?: string; key?: string; messageId?: number; jobId?: number }
  output: { failures: number; alerted: number }
}> = {
  slug: 'O3-failure-alert',
  label: 'O3 · Tell an owner when sends or jobs keep failing',
  // One at a time: two failures at once never race to send the hour's alert.
  concurrency: () => 'O3-failure-alert',
  retries: TASK_RETRIES,
  // The event that queued it (src/lib/automations/emit.ts): ids only.
  inputSchema: [
    { name: 'name', type: 'text' },
    { name: 'key', type: 'text' },
    { name: 'messageId', type: 'number' },
    { name: 'jobId', type: 'number' },
  ],
  outputSchema: [
    { name: 'failures', type: 'number', required: true },
    { name: 'alerted', type: 'number', required: true },
  ],
  handler: async ({ req }) => {
    const { raiseFailureAlert } = await import('@/lib/automations/failureAlert')
    return { output: await raiseFailureAlert(req) }
  },
  onFail: (args) => onFail(args),
}

export const messagingTasks: NonNullable<JobsConfig['tasks']> = [
  dispatchTask,
  failureAlertTask,
] as NonNullable<JobsConfig['tasks']>
