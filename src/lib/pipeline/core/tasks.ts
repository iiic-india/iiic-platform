import { POLICY } from '@/access/policy'
import { err, ok } from '@/lib/result'
import type { Task } from '@/payload-types'

import type { CloseTask, CreateTask } from '../tasks'
import { TASK_MOVES, type TaskStatus } from '../values'
import { asPlatform, staffWithCode } from './actor'

/**
 * Tasks (docs/17 §2, §4; src/lib/pipeline/tasks.ts). One task per key: a retried automation finds
 * the task it made and makes no second one; the unique index on `key` is the database's word on a
 * race. The tasks' hook holds TASK_MOVES, stamps `doneAt` and `doneBy`, and emits `task.created`.
 * Free of `server-only`.
 */

/** The automation id a key starts with: "P1:enquiry:42" is P1's. */
export function automationOf(key: string | undefined): string | undefined {
  const head = key?.split(':')[0]
  return head && /^[A-Z]\d+$/.test(head) ? head : undefined
}

/** CreateTask: makes a task, or returns the one its key already made. */
export const createTask: CreateTask = async (req, input) => {
  if (input.key) {
    const { docs } = await req.payload.find({
      collection: 'tasks',
      where: { key: { equals: input.key } },
      limit: 1,
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
    })
    if (docs[0]) return ok(docs[0] as Task)
  }
  if (input.leadId !== undefined) {
    const lead = await req.payload.findByID({
      collection: 'leads',
      id: input.leadId,
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
      req,
    })
    if (!lead) return err({ code: 'not-found' })
  }
  const task = await asPlatform(req, null, () =>
    req.payload.create({
      collection: 'tasks',
      data: {
        kind: input.kind,
        title: input.title,
        status: 'open',
        dueOn: input.dueOn,
        role: input.role,
        assignee: input.assigneeId,
        lead: input.leadId,
        note: input.note,
        automation: input.automation ?? automationOf(input.key),
        key: input.key,
      },
      depth: 0,
      overrideAccess: true,
      req,
    }),
  )
  return ok(task as Task)
}

/** CloseTask: done or cancelled once, by an owner or an operator who has entered the code. */
export const closeTask: CloseTask = async (req, input) => {
  if (!staffWithCode(req.user, POLICY.tasks.update.roles) || req.user?.id !== input.by) {
    return err({ code: 'not-allowed' })
  }
  const task = (await req.payload.findByID({
    collection: 'tasks',
    id: input.taskId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })) as Task | null
  if (!task) return err({ code: 'not-found' })
  if (!TASK_MOVES[task.status as TaskStatus].includes(input.status)) {
    return err({ code: 'not-allowed' })
  }
  const closed = await asPlatform(req, input.by, () =>
    req.payload.update({
      collection: 'tasks',
      id: task.id,
      data: { status: input.status },
      depth: 0,
      overrideAccess: true,
      req,
    }),
  )
  return ok(closed as Task)
}
