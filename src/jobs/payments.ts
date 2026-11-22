import type { JobsConfig, TaskConfig } from 'payload'

import { isIstDay } from '@/fields/istDay'

/**
 * The payments module's tasks (docs/16 §12, builder B): the order-status poll and the daily
 * reconciliation (B11), which M3 owns. Each is named by its automation ID and is idempotent: an
 * event they find is stored under an id of its own and acted on once, however often they run.
 *
 * Nothing runs them on their own yet: Payload's autoRun is never used on Vercel (CLAUDE.md), and
 * M6's cron runner queues them (B11 daily at 23:00, the poll every few minutes); until then an
 * owner runs them through the jobs API. The payments module is loaded when a task runs, not when
 * the Payload config is read, because it holds the gateway's secrets and is marked `server-only`,
 * which the Payload CLI cannot load (src/lib/env.ts says why).
 */

/** B11 looks back a little over a day by default, so a run a few minutes late misses nothing. */
const LOOK_BACK_MS = 26 * 60 * 60 * 1000

export const pollPendingOrdersTask: TaskConfig<{ input: object; output: { checked: number } }> = {
  slug: 'B2-poll-pending-orders',
  label: 'B2 · Ask the gateway about payments whose webhook has not come',
  // docs/06, Engine rules: three attempts, then the job fails where the team sees it.
  retries: 3,
  outputSchema: [{ name: 'checked', type: 'number', required: true }],
  handler: async ({ req }) => {
    const { payments } = await import('@/lib/payments/wiring')
    const { checked } = await payments().pollPendingOrders(req, new Date())
    return { output: { checked } }
  },
}

export const reconcileTask: TaskConfig<{
  input: { day?: string | null }
  output: { checked: number; flagged: number }
}> = {
  slug: 'B11-reconcile',
  label: 'B11 · Reconcile the gateway’s payments with the platform’s',
  retries: 3,
  inputSchema: [
    {
      name: 'day',
      type: 'text',
      admin: { description: 'A day in India as YYYY-MM-DD; empty for the last 26 hours.' },
    },
  ],
  outputSchema: [
    { name: 'checked', type: 'number', required: true },
    { name: 'flagged', type: 'number', required: true },
  ],
  handler: async ({ input, req }) => {
    const { payments } = await import('@/lib/payments/wiring')
    const { istDayWindow } = await import('@/lib/payments/reconcile')
    const now = new Date()
    const window = isIstDay(input.day)
      ? istDayWindow(input.day)
      : { from: new Date(now.getTime() - LOOK_BACK_MS), to: now }
    const { checked, flagged } = await payments().reconcileDay(req, window)
    return { output: { checked, flagged } }
  },
}

export const paymentTasks: NonNullable<JobsConfig['tasks']> = [pollPendingOrdersTask, reconcileTask]
