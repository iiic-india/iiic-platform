import type { JobsConfig } from 'payload'

import { ownerWithCode } from '@/access/policy'
import { withFailurePath } from '@/lib/automations/failures'
import { withSchedule } from '@/lib/automations/schedules'

import { bookingTasks } from './booking'
import { bookingMessageTasks } from './bookingMessages'
import { calendarTasks } from './calendar'
import { documentTasks } from './documents'
import { messagingTasks } from './messaging'
import { newsletterTasks } from './newsletter'
import { operationsTasks } from './operations'
import { paymentTasks } from './payments'
import { pipelineTasks } from './pipeline'
import { proposalTasks } from './proposals'
import { purgeMissingPagesTask } from './purgeMissingPages'

/**
 * Automations as Payload tasks named by their ID in docs/06 (CLAUDE.md). No autoRun: on Vercel
 * the cron route (`/api/cron/jobs`, docs/19 §2) queues the scheduled tasks (`schedule`, from
 * src/lib/automations/schedules.ts, so no task file holds a time) and runs the queue every minute.
 * Every task without an `onFail` of its own gets the shared failure path (src/lib/automations/
 * failures.ts): once its retries are spent it is counted and raises `automation.failed` for O3.
 * Only an owner who has entered their two-factor code may run, queue or cancel them through the
 * API; Payload's default would let any signed-in account. The cron route runs them through the
 * local API after checking its own secret.
 */
export const jobs: JobsConfig = {
  // M3's, M4's and M6's builders each add tasks to a file of their own (docs/16 §12, docs/17 §11,
  // docs/19 §9).
  tasks: [
    purgeMissingPagesTask,
    ...bookingTasks,
    ...paymentTasks,
    ...calendarTasks,
    ...documentTasks,
    ...pipelineTasks,
    ...proposalTasks,
    ...messagingTasks,
    ...bookingMessageTasks,
    ...operationsTasks,
    ...newsletterTasks,
  ]
    .map(withSchedule)
    .map(withFailurePath),
  // A task may name a concurrency key (docs/19 §2): `messages-dispatch` runs one at a time even
  // when two cron calls overlap. Adds a column to the jobs table: the join's migration covers it.
  enableConcurrencyControl: true,
  access: { run: ownerWithCode, queue: ownerWithCode, cancel: ownerWithCode },
}
