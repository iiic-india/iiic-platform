import type { PayloadRequest } from 'payload'

import type { IstDay } from '@/lib/booking/types'
import type { Result } from '@/lib/result'
import type { Task } from '@/payload-types'

import type { PipelineError } from './leads'
import type { TaskKind, TaskRole } from './values'

/**
 * Tasks and working days (docs/17 §4; docs/06, Engine rules: Ownership), as contracts for
 * builder A. A working day is Monday to Friday in India (the office's hours, copy architecture
 * §4.9); the holidays IIIC keeps are an input (docs/17 §10) and, until it is supplied, none.
 */

/** P1 and P7: the first reply to a request is due in two working days (docs/03 F5, docs/06). */
export const FIRST_REPLY_WORKING_DAYS = 2

/** P5: the follow-up after a proposal is sent is due in three working days (docs/05, docs/06). */
export const PROPOSAL_FOLLOW_UP_WORKING_DAYS = 3

/**
 * The day `days` working days after `from`, in India: from a Friday evening, two working days is
 * Tuesday. `holidays` are skipped like weekends.
 */
export type AddWorkingDays = (from: Date, days: number, holidays?: readonly IstDay[]) => IstDay

/**
 * Makes a task, once per `key` (such as `P1:enquiry:42`): a second call with the same key returns
 * the task the first made. Emits `task.created` for a new one.
 */
export type CreateTask = (
  req: PayloadRequest,
  input: {
    kind: TaskKind
    title: string
    dueOn: IstDay
    role: TaskRole
    assigneeId?: number
    leadId?: number
    note?: string
    automation?: string
    key?: string
  },
) => Promise<Result<Task, PipelineError>>

/** Closes a task as done or cancelled (TASK_MOVES), recording who and when. */
export type CloseTask = (
  req: PayloadRequest,
  input: { taskId: number; status: 'done' | 'cancelled'; by: number },
) => Promise<Result<Task, PipelineError>>
