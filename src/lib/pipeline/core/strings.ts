import { LEAD_KINDS, LEAD_STAGES, type LeadKind, type LeadStage } from '../stages'
import { ENQUIRY_KINDS, TASK_KINDS, type EnquiryKind, type TaskKind } from '../values'

/**
 * The CRM core's words, in one place for en-IN (CLAUDE.md, Conventions): the names the platform
 * gives leads and tasks, the reason a spam enquiry's lead ends with, and the messages the
 * collections' hooks show the office beside a field. Admin copy only; none reaches a visitor.
 * Free of `server-only`: the collections load them.
 */

const kindLabel = (kind: LeadKind) => LEAD_KINDS.find((entry) => entry.value === kind)?.label ?? ''
const stageLabel = (stage: LeadStage) =>
  LEAD_STAGES.find((entry) => entry.value === stage)?.label ?? String(stage)

/** A lead's name: its organisation and its kind, never a person's name (docs/17 §2). */
export function leadTitle(organisationName: string | null | undefined, kind: LeadKind): string {
  const name = organisationName?.trim()
  return `${name || 'No organisation yet'} · ${kindLabel(kind)}`
}

/** A task's title, from its kind's label: "Reply to the request". */
export function taskTitle(kind: TaskKind): string {
  return TASK_KINDS.find((entry) => entry.value === kind)?.label ?? ''
}

/** How a person made by a form came to IIIC (`people.source`). */
export function personSourceFor(kind: EnquiryKind): string {
  return ENQUIRY_KINDS.find((entry) => entry.value === kind)?.label ?? ''
}

/** Why a lead an enquiry made ends when the office marks that enquiry as spam (docs/17 §4). */
export const SPAM_REASON = 'Spam'

/** What matching tells the office on an enquiry (docs/17 §4, step 1). */
export const ENQUIRY_CONFLICTS = [
  {
    value: 'emailAndMobileDiffer',
    label: 'The email and the mobile belong to two different people',
  },
] as const

export const HOOK_MESSAGES = {
  kindFixed: 'A lead’s kind stays as it was made. Start a new lead for the other kind.',
  ended: 'This lead has ended, so its stage stays. A new request opens a new lead.',
  badMove: (from: LeadStage, to: LeadStage) =>
    `A lead in ${stageLabel(from)} cannot move to ${stageLabel(to)}.`,
  staffType: 'Choose a note, call, email, WhatsApp message or file. The platform records the rest.',
  activityFixed: 'Timeline entries are never changed. Add a new note to put one right.',
  taskClosed: 'This task is already done or cancelled. Add a new task instead.',
} as const
