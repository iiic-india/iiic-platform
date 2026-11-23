import type { TaskConfig } from 'payload'

/**
 * The proposals' tasks (docs/17 §12, builder C), each named by its automation ID and idempotent
 * (CLAUDE.md): `P8-expire-proposals` (a sent proposal past its "valid until" day with no answer;
 * P8 is proposed, docs/17 §10). The proposal email is sent by the send itself (docs/17 §5), not
 * by a job. Builder C adds the task here; its slug joins the jobs table's enum, so the merge's
 * one migration covers it (docs/17 §12).
 */
export const proposalTasks: TaskConfig[] = []
