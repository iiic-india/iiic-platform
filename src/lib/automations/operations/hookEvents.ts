import type { PayloadRequest } from 'payload'

import { automationEventKey, type AutomationEvent } from '@/lib/automations/events'
import { AUTOMATION_LISTENERS } from '@/lib/automations/listeners'

/**
 * Raising an automation event from a collection hook (docs/19 §2): an editor schedules a
 * newsletter issue, the office moves a review to "Consent requested", the ledger records a
 * withdrawal. It queues exactly as `emitAutomationEvent` does (src/lib/automations/emit.ts): one
 * job per subscribed task, in the hook's transaction, keyed `<event>:<id>`, never a second while
 * one waits. That module is `server-only`, and the collections are loaded by the Payload CLI too,
 * so the hooks use this copy of its few lines, which reads the same listeners.
 */
type Queue = (args: {
  task: string
  input: Record<string, unknown>
  req: PayloadRequest
}) => Promise<unknown>

export async function queueFromHook(req: PayloadRequest, event: AutomationEvent): Promise<number> {
  const tasks = AUTOMATION_LISTENERS[event.name] ?? []
  const key = automationEventKey(event)
  let queued = 0
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
    queued += 1
  }
  return queued
}
