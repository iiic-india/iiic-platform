import type { JobsConfig } from 'payload'

import { ownerWithCode } from '@/access/policy'

import { purgeMissingPagesTask } from './purgeMissingPages'

/**
 * Automations as Payload tasks named by their ID in docs/06 (CLAUDE.md). No autoRun: on Vercel
 * the cron runner (M6, docs/07) queues and runs them; until then nothing runs them on their own.
 * Only an owner who has entered their two-factor code may run, queue or cancel them through the
 * API; Payload's default would let any signed-in account.
 */
export const jobs: JobsConfig = {
  tasks: [purgeMissingPagesTask],
  access: { run: ownerWithCode, queue: ownerWithCode, cancel: ownerWithCode },
}
