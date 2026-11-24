import 'server-only'

import type { PayloadRequest } from 'payload'

import { automationOfTask, TASK_RETRIES } from './failures'

/**
 * Jobs left `processing` by a run that never finished (docs/19 §2). The cron route's function
 * lives at most 60 seconds; when it is stopped mid-job, Payload leaves that job marked
 * `processing` for good. Payload's runner then never picks it again, a scheduled task is not
 * queued while it waits, and a task with a concurrency key (`messages-dispatch`) blocks every
 * later run of itself: the dispatcher would stop, silently.
 *
 * So each cron call first releases the jobs that have been `processing` for longer than any run
 * can last. A released job runs again on this call, as a retry: every task is idempotent (one
 * message row per key, one job per event key). Each release counts as a failure of its automation
 * on the Automations screen; once a job has been released as many times as a task may retry, it
 * is stopped with an error instead, which O3 counts, and `automation.failed` tells O3 at once.
 */

/** Far past the 60-second limit of the function that runs jobs: no live run is this old. */
export const STALE_JOB_AFTER_MS = 5 * 60 * 1000

/** How many stuck jobs one call releases; the next minute takes the rest. */
const RELEASE_LIMIT = 50

export type StaleJobsDeps = {
  countFailure: (req: PayloadRequest, taskSlug: string, now: Date) => Promise<void>
  raiseFailed: (req: PayloadRequest, jobId: number) => Promise<void>
}

const defaultDeps: StaleJobsDeps = {
  countFailure: async (req, taskSlug, now) => {
    const automation = automationOfTask(taskSlug)
    if (!automation) return
    const { countOutcome } = await import('./rows')
    await countOutcome(req, automation, 'failure', now)
  },
  raiseFailed: async (req, jobId) => {
    const { emitAutomationEvent } = await import('./emit')
    await emitAutomationEvent(req, { name: 'automation.failed', jobId })
  },
}

export type Released = { released: number; stopped: number }

export async function releaseStaleJobs(
  req: PayloadRequest,
  now: Date,
  deps: StaleJobsDeps = defaultDeps,
): Promise<Released> {
  const before = new Date(now.getTime() - STALE_JOB_AFTER_MS).toISOString()
  const { docs } = await req.payload.find({
    collection: 'payload-jobs',
    where: {
      and: [
        { processing: { equals: true } },
        { completedAt: { exists: false } },
        { updatedAt: { less_than: before } },
      ],
    },
    sort: 'updatedAt',
    limit: RELEASE_LIMIT,
    depth: 0,
    select: { taskSlug: true, totalTried: true },
    overrideAccess: true,
    req,
  })
  const result: Released = { released: 0, stopped: 0 }
  for (const job of docs) {
    const jobId = Number(job.id)
    const taskSlug = String(job.taskSlug ?? '')
    const tried = Number(job.totalTried ?? 0) + 1
    const spent = tried > TASK_RETRIES.attempts
    await req.payload.db.updateOne({
      collection: 'payload-jobs',
      id: jobId,
      data: spent
        ? {
            processing: false,
            totalTried: tried,
            hasError: true,
            error: { message: 'stopped-unfinished' },
          }
        : { processing: false, totalTried: tried },
      req,
    })
    await deps.countFailure(req, taskSlug, now)
    if (spent) {
      result.stopped += 1
      // O3's own job raises nothing, so a failing alert never queues another (as `onFail`).
      if (Number.isInteger(jobId) && automationOfTask(taskSlug) !== 'O3') {
        await deps.raiseFailed(req, jobId)
      }
    } else {
      result.released += 1
    }
  }
  return result
}
