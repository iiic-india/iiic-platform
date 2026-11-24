import type { PayloadRequest } from 'payload'

import type {
  EmitPipelineEvent,
  PipelineEvent,
  PipelineEventKey,
  PipelineEventName,
} from '../events'

/**
 * The pipeline's events into jobs (docs/17 §8; src/lib/pipeline/events.ts), as M3's are
 * (src/lib/booking/emit.ts): an event queues one Payload job per task subscribed to it, inside
 * the request's transaction, with the key `<event>:<subject>` in the job's input; a job still
 * waiting with the same key is not queued twice. The input is the event itself: ids and codes
 * only. M4 subscribes nothing to its own events; M6 adds the messages and the digest, M5 reads
 * Today from the records. Free of `server-only`: the collections' hooks emit too.
 */

/** The tasks each pipeline event starts, by their automation IDs (docs/06). M6 adds its own. */
export type PipelineListeners = { readonly [Name in PipelineEventName]?: readonly string[] }

export const PIPELINE_LISTENERS: PipelineListeners = {}

/** The idempotency key: the event and its subject, and for a repeatable event what sets it apart. */
export const pipelineEventKey: PipelineEventKey = (event) => {
  switch (event.name) {
    case 'enquiry.received':
      return `${event.name}:${event.enquiryId}`
    case 'lead.created':
      return `${event.name}:${event.leadId}`
    case 'lead.stageChanged':
      return `${event.name}:${event.leadId}:${event.activityId}`
    case 'lead.untouched':
      return `${event.name}:${event.leadId}:${event.level}`
    case 'lead.stale':
      return `${event.name}:${event.leadId}:${event.since}`
    case 'task.created':
      return `${event.name}:${event.taskId}`
    case 'proposal.versionCreated':
    case 'proposal.sent':
    case 'proposal.viewed':
      return `${event.name}:${event.versionId}`
    case 'proposal.accepted':
    case 'proposal.declined':
    case 'proposal.expired':
      return `${event.name}:${event.proposalId}`
  }
}

type Queue = (args: {
  task: string
  input: Record<string, unknown>
  req: PayloadRequest
}) => Promise<unknown>

/** An emitter for a set of listeners (the real one is `emitPipelineEvent`; tests give theirs). */
export function pipelineEmitterFor(listeners: PipelineListeners): EmitPipelineEvent {
  return async (req, event: PipelineEvent) => {
    const tasks = listeners[event.name] ?? []
    if (!tasks.length) return
    const key = pipelineEventKey(event)
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

/** Queues the event's listeners inside the request's transaction. */
export const emitPipelineEvent: EmitPipelineEvent = pipelineEmitterFor(PIPELINE_LISTENERS)
