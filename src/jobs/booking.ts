import type { TaskConfig } from 'payload'

/**
 * The booking engine's tasks (docs/16 §12, builder A), each named by its automation ID and
 * idempotent (CLAUDE.md).
 *
 * B4 · Hold expired unpaid (docs/06): moves every hold past its time to `expired`, which frees
 * the time, and emits `booking.holdExpired` for each (no message for a counselling session).
 * Run twice, the second run finds nothing. Holds are also expired before any new hold for the
 * same practitioner, so a lapsed hold never keeps a time from someone else even while this has
 * not run. Nothing runs it on its own until the cron runner (M6); an owner can run it through
 * the jobs API meanwhile.
 *
 * The booking module is marked server-only and the Payload config is loaded outside the server
 * bundle too (the CLI), so it is imported when the task runs, not when the config loads.
 */
export const expireHoldsTask: TaskConfig<{ input: object; output: { expired: number } }> = {
  slug: 'B4-expire-holds',
  label: 'B4 · Release holds past their time',
  // docs/06, Engine rules: three attempts, then the job fails where the team sees it.
  retries: 3,
  outputSchema: [{ name: 'expired', type: 'number', required: true }],
  handler: async ({ req }) => {
    const { expireHolds } = await import('@/lib/booking/holds')
    return { output: { expired: await expireHolds(req, new Date()) } }
  },
}

export const bookingTasks: TaskConfig[] = [expireHoldsTask as TaskConfig]
