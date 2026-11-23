import type { TaskConfig } from 'payload'

import { AUTOMATIONS, type AutomationId } from './catalogue'

/** What Payload hands a task's `onFail` (its TaskCallbackArgs, not exported by name). */
export type TaskCallbackArgs = Parameters<NonNullable<TaskConfig['onFail']>>[0]

/**
 * What every M6 task does about faults (docs/19 §2): three retries with exponential backoff from
 * 60 seconds for a fault (the database or a module throwing); a provider's refusal is the
 * message's own retry, not the task's. When a task has spent its retries, the shared `onFail`
 * adds to its automation's failure count and raises `automation.failed`, which O3 hears.
 *
 * Free of `server-only` so the task files (read by the Payload CLI too) import it; the counting
 * and the emitter are loaded when a failure happens.
 */
export const TASK_RETRIES = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 60_000 },
} as const

/** The automation a task runs, by its slug, from the catalogue. */
export function automationOfTask(taskSlug: string | undefined): AutomationId | null {
  if (!taskSlug) return null
  const found = AUTOMATIONS.find((entry) => 'task' in entry && entry.task === taskSlug)
  return found ? (found.id as AutomationId) : null
}

/**
 * Whether this failure is the last one: Payload calls `onFail` after every failed try, and gives
 * up once the tries made before this one reach the attempts allowed (its handleTaskError).
 */
export function retriesSpent(
  taskStatus: TaskCallbackArgs['taskStatus'],
  attempts: number = TASK_RETRIES.attempts,
): boolean {
  if (taskStatus?.complete) return false
  return (taskStatus?.totalTried ?? 0) >= attempts
}

/**
 * The shared `onFail` for a task's config: `onFail: (args) => onFail(args)`. O3's own task counts
 * its failure but raises nothing, so a failing alert never queues another alert.
 */
export async function onFail(
  args: TaskCallbackArgs,
  options: { attempts?: number } = {},
): Promise<void> {
  if (!retriesSpent(args.taskStatus, options.attempts)) return
  const slug = String(args.taskStatus?.taskSlug ?? args.job.taskSlug ?? '')
  const automation = automationOfTask(slug)
  if (automation) {
    const { countOutcome } = await import('./rows')
    await countOutcome(args.req, automation, 'failure', new Date())
  }
  if (automation === 'O3') return
  const jobId = Number(args.job.id)
  if (!Number.isInteger(jobId)) return
  const { emitAutomationEvent } = await import('./emit')
  await emitAutomationEvent(args.req, { name: 'automation.failed', jobId })
}

type AnyTask = TaskConfig<never>

/** The tries a task's config allows: Payload's `retries` is a count or `{ attempts }`. */
export function attemptsOf(retries: AnyTask['retries']): number {
  if (typeof retries === 'number') return retries
  return retries?.attempts ?? 0
}

/**
 * Gives a task without an `onFail` of its own the shared one, counted against the tries its own
 * config allows (src/jobs/index.ts applies it to every task, M3's included), so a job that spends
 * its retries is counted and raises `automation.failed` for O3 wherever it was written.
 */
export function withFailurePath<T extends { onFail?: unknown; retries?: unknown }>(task: T): T {
  if (task.onFail) return task
  const attempts = attemptsOf(task.retries as AnyTask['retries'])
  return { ...task, onFail: (args: TaskCallbackArgs) => onFail(args, { attempts }) }
}
