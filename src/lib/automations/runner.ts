import 'server-only'

import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * The job runner's rules (docs/19 §2), apart from the route so each has a test: who may start a
 * run, and how long one runs. The route (`/api/cron/jobs`) is the only thing that runs the queue on
 * Vercel; Payload's `autoRun` is never set (docs/07).
 */

export type CronRefusal = {
  status: 401 | 404 | 503
  code: 'not-configured' | 'not-production' | 'unauthorised'
}

/**
 * Whether a call may run the queue: 503 while `CRON_SECRET` is unset (the platform still builds
 * and runs); 404 on any Vercel deployment but production, because previews share production's
 * database and must never run a job or send a message; 401 unless the call carries
 * `Authorization: Bearer <CRON_SECRET>`, compared in constant time over SHA-256 digests, so
 * neither the secret's length nor its prefix leaks through timing. Null when it may.
 */
export function refuseCron(input: {
  secret: string | undefined
  authorization: string | null
  vercelEnv: string | undefined
}): CronRefusal | null {
  if (!input.secret) return { status: 503, code: 'not-configured' }
  if (input.vercelEnv && input.vercelEnv !== 'production') {
    return { status: 404, code: 'not-production' }
  }
  const header = input.authorization ?? ''
  const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  if (!presented || !sameSecret(presented, input.secret)) {
    return { status: 401, code: 'unauthorised' }
  }
  return null
}

function sameSecret(presented: string, secret: string): boolean {
  const a = createHash('sha256').update(presented, 'utf8').digest()
  const b = createHash('sha256').update(secret, 'utf8').digest()
  return timingSafeEqual(a, b)
}

/** What one round of the queue did: how many jobs it ran, and whether any are left. */
export type Round = { ran: number; remaining: boolean }

export type RunSummary = { rounds: number; ran: number; stoppedBy: 'empty' | 'budget' }

/**
 * Runs the queue in rounds until it is empty or the time budget is spent (45 s of the function's
 * 60). A round that starts before the budget ends may finish after it; the budget leaves room for
 * one. `now` is the clock, passed in so the tests need not wait.
 */
export async function runRounds(
  round: () => Promise<Round>,
  options: { budgetMs: number; now?: () => number; maxRounds?: number },
): Promise<RunSummary> {
  const now = options.now ?? Date.now
  const started = now()
  const maxRounds = options.maxRounds ?? 100
  let rounds = 0
  let ran = 0
  while (rounds < maxRounds) {
    if (now() - started >= options.budgetMs) return { rounds, ran, stoppedBy: 'budget' }
    const result = await round()
    rounds += 1
    ran += result.ran
    if (result.ran === 0 || !result.remaining) return { rounds, ran, stoppedBy: 'empty' }
  }
  return { rounds, ran, stoppedBy: 'budget' }
}

/** The route's time budget and how many jobs one round takes (docs/19 §2). */
export const RUN_BUDGET_MS = 45_000
export const JOBS_PER_ROUND = 25
