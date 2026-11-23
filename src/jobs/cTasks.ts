import type { PayloadRequest, TaskConfig } from 'payload'

import { OUTCOME_SCHEMA, type Outcome } from '@/lib/automations/operations/outcome'

/**
 * How builder C's tasks are made (docs/19 §2): named by their automation ID, three retries with
 * exponential backoff from a minute for faults (a provider's refusal is the core's to retry, not
 * the task's), the event's key as the concurrency key so two jobs about one subject never run at
 * once, and an output of counts and codes only. Each loads its server-only module when it runs,
 * never when the config loads (the Payload CLI reads the jobs config too).
 */
export type Run = (req: PayloadRequest, input: unknown, now: Date) => Promise<Outcome>

export const RETRIES = { attempts: 3, backoff: { type: 'exponential' as const, delay: 60_000 } }

export function cTask(
  slug: string,
  label: string,
  load: () => Promise<Run>,
): TaskConfig<{ input: object; output: Outcome }> {
  return {
    slug,
    label,
    retries: RETRIES,
    concurrency: ({ input }) => {
      const key = (input as { key?: unknown }).key
      return typeof key === 'string' ? `${slug}:${key}` : slug
    },
    outputSchema: OUTCOME_SCHEMA,
    handler: async ({ input, req }) => {
      const run = await load()
      return { output: await run(req, input, new Date()) }
    },
  }
}
