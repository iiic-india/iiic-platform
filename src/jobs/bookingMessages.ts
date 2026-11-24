import type { JobsConfig, TaskConfig } from 'payload'

import { automation, type AutomationId } from '@/lib/automations/catalogue'

/**
 * Builder B's tasks (docs/19 §5, §9): the booking and payment messages, one task per automation,
 * named by its ID as the catalogue gives it. Each reads the event's ids, plans, and asks the core
 * to cancel and record (src/lib/automations/booking/tasks.ts); the core sends when each message is
 * due. The listeners come from the catalogue (src/lib/automations/listeners.ts), so no emitter
 * changes. The work is imported when a task runs, not when the config loads: it is server-only and
 * the Payload CLI loads this file too.
 */

// docs/19 §2: three attempts, backoff from 60 s, then the shared failure path (O3).
const RETRIES = { attempts: 3, backoff: { type: 'exponential' as const, delay: 60_000 } }

type Output = {
  outcome: string
  cancelled: number
  planned: number
  created: number
  refused: string
}

function bookingMessageTask(id: AutomationId): TaskConfig<{ input: object; output: Output }> {
  const entry = automation(id)
  const slug = entry.task as string
  return {
    slug,
    label: `${id} · ${entry.title}`,
    retries: RETRIES,
    outputSchema: [
      { name: 'outcome', type: 'text', required: true },
      { name: 'cancelled', type: 'number', required: true },
      { name: 'planned', type: 'number', required: true },
      { name: 'created', type: 'number', required: true },
      { name: 'refused', type: 'text', required: true },
    ],
    handler: async ({ input, req }) => {
      const { runBookingTask, BOOKING_TASK_SLUGS } = await import('@/lib/automations/booking/tasks')
      const known = BOOKING_TASK_SLUGS.find((candidate) => candidate === slug)
      if (!known) throw new Error(`No booking message task is named ${slug}.`)
      const { refused, ...rest } = await runBookingTask(known, input, req)
      return { output: { ...rest, refused: refused.join(',') } }
    },
  }
}

export const BOOKING_MESSAGE_AUTOMATIONS = [
  'B2',
  'B3',
  'B3a',
  'B5',
  'B6',
  'B7',
  'B8',
  'B9',
  'B10',
  'B12',
  'B13',
] as const satisfies readonly AutomationId[]

export const bookingMessageTasks: NonNullable<JobsConfig['tasks']> =
  BOOKING_MESSAGE_AUTOMATIONS.map(bookingMessageTask)
