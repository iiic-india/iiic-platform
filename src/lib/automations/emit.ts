import 'server-only'

import type { PayloadRequest } from 'payload'

import { automationEventKey, type AutomationEvent } from './events'
import { AUTOMATION_LISTENERS, type AutomationListeners } from './listeners'

/**
 * Raising an event that is not the booking module's (docs/19 §2): a message failed or an address
 * was suppressed (builder A), a consent withdrawn, a newsletter signup, a review's consent request
 * (builder C), and later M4's and M5's. It works as M3's `emit` does: one Payload job per
 * subscribed task, queued in the caller's transaction (a rolled-back change queues nothing), with
 * the key `<event>:<id>` in the job's input; a job still waiting with the same key is not queued
 * again. Booking and payment events keep going through src/lib/booking/emit.ts, whose listeners
 * include M6's (`withAutomationListeners`).
 */
export type EmitAutomationEvent = (req: PayloadRequest, event: AutomationEvent) => Promise<void>

type Queue = (args: {
  task: string
  input: Record<string, unknown>
  req: PayloadRequest
}) => Promise<unknown>

export function automationEmitterFor(listeners: AutomationListeners): EmitAutomationEvent {
  return async (req, event) => {
    const tasks = listeners[event.name] ?? []
    if (!tasks.length) return
    const key = automationEventKey(event)
    for (const task of tasks) {
      const waiting = await req.payload.count({
        collection: 'payload-jobs',
        where: {
          and: [
            { taskSlug: { equals: task } },
            { 'input.key': { equals: key } },
            { completedAt: { exists: false } },
          ],
        },
        overrideAccess: true,
        req,
      })
      if (waiting.totalDocs > 0) continue
      await (req.payload.jobs.queue as unknown as Queue)({ task, input: { ...event, key }, req })
    }
  }
}

export const emitAutomationEvent: EmitAutomationEvent = automationEmitterFor(AUTOMATION_LISTENERS)
