import { createLocalReq, getPayload } from 'payload'

import { JOBS_PER_ROUND, refuseCron, RUN_BUDGET_MS, runRounds } from '@/lib/automations/runner'
import { releaseStaleJobs } from '@/lib/automations/staleJobs'
import { env } from '@/lib/env'
import { reportError } from '@/lib/monitoring/sentry'
import config from '@payload-config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60
export const preferredRegion = 'bom1'

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }

/**
 * GET /api/cron/jobs (docs/19 §2): the only thing that runs the job queue on Vercel; Payload's
 * autoRun is never set (docs/07). Vercel Cron calls it every minute with `CRON_SECRET` as a bearer
 * token (the minute cron lands in vercel.json with the move to Pro; until then an owner calls it).
 * It refuses before touching the database (src/lib/automations/runner.ts): 503 without a secret,
 * 404 on a preview, which shares production's database, 401 without the right token. Then it
 * releases the jobs an earlier run left `processing` when its function was stopped
 * (src/lib/automations/staleJobs.ts), queues each scheduled task whose time has come (once per
 * slot), and runs the queue in rounds of 25 until it is empty or 45 seconds have passed. It
 * answers counts only.
 */
export async function GET(request: Request) {
  const settings = env()
  const refusal = refuseCron({
    secret: settings.CRON_SECRET,
    authorization: request.headers.get('authorization'),
    vercelEnv: settings.VERCEL_ENV,
  })
  if (refusal) {
    return Response.json(
      { ran: false, error: refusal.code },
      { status: refusal.status, headers: HEADERS },
    )
  }
  const payload = await getPayload({ config })
  try {
    const stale = await releaseStaleJobs(await createLocalReq({}, payload), new Date())
    const scheduled = await payload.jobs.handleSchedules({ allQueues: true })
    const summary = await runRounds(
      async () => {
        const result = await payload.jobs.run({ allQueues: true, limit: JOBS_PER_ROUND })
        return {
          ran: Object.keys(result.jobStatus ?? {}).length,
          remaining: !result.noJobsRemaining,
        }
      },
      { budgetMs: RUN_BUDGET_MS },
    )
    return Response.json(
      {
        ran: true,
        released: stale.released,
        stopped: stale.stopped,
        scheduled: scheduled.queued.length,
        rounds: summary.rounds,
        jobs: summary.ran,
        stoppedBy: summary.stoppedBy,
      },
      { headers: HEADERS },
    )
  } catch (error) {
    // The cause goes to Sentry; the answer and the log carry a code only.
    await reportError(error, { area: 'cron' })
    payload.logger.error('cron: the job runner failed (see Sentry)')
    return Response.json({ ran: false, error: 'fault' }, { status: 500, headers: HEADERS })
  }
}
