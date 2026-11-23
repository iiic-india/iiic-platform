import type { JobsConfig } from 'payload'

/**
 * The timed automations (docs/19 §2): each task's cron, in UTC with a seconds field, as Payload's
 * scheduler reads it (`schedule` on a task; queued by `payload.jobs.handleSchedules()` from the cron
 * route, never by autoRun). India is UTC+05:30 all year, so each IST time below is exact.
 * Pure data; the jobs config applies it (src/jobs/index.ts), so no task file holds a schedule.
 */
export type Schedule = { cron: string; ist: string }

export const SCHEDULES: Readonly<Record<string, Schedule>> = {
  // The messaging core: sends what is due, retries, catches stale sends (builder A).
  'messages-dispatch': { cron: '0 * * * * *', ist: 'every minute' },
  // M3's tasks, which nothing ran on their own until now (docs/16 §5, §7).
  'B4-expire-holds': { cron: '0 * * * * *', ist: 'every minute' },
  'B2-poll-pending-orders': { cron: '0 */5 * * * *', ist: 'every 5 minutes' },
  'B14-refresh-busy-times': { cron: '0 */15 * * * *', ist: 'every 15 minutes' },
  'B11-reconcile': { cron: '0 30 17 * * *', ist: 'daily 23:00' },
  // M2's 404-log purge and M6's retention, at night in India (docs/06 O5).
  'O5-purge-missing-pages': { cron: '0 30 20 * * *', ist: 'daily 02:00' },
  'O5-retention': { cron: '0 45 20 * * *', ist: 'daily 02:15' },
  // The morning read (docs/13 §8).
  'O1-daily-digest': { cron: '0 0 3 * * *', ist: 'daily 08:30' },
  'O2-weekly-report': { cron: '0 30 3 * * 1', ist: 'Monday 09:00' },
  'O6-backup-check': { cron: '0 0 4 * * *', ist: 'daily 09:30' },
  // M4's pipeline checks (P3, P4 hourly; P6 each morning).
  'P3-P4-lead-ages': { cron: '0 5 * * * *', ist: 'hourly at :35' },
  'P6-proposal-follow-up': { cron: '0 15 3 * * *', ist: 'daily 08:45' },
}

/** The queue every scheduled task is queued on, the one the cron route runs. */
export const SCHEDULE_QUEUE = 'default'

type AnyTask = NonNullable<JobsConfig['tasks']>[number]

/** A task with its schedule from the table, when it has one. */
export function withSchedule(task: AnyTask): AnyTask {
  const schedule = SCHEDULES[String(task.slug)]
  if (!schedule) return task
  return { ...task, schedule: [{ cron: schedule.cron, queue: SCHEDULE_QUEUE }] }
}
