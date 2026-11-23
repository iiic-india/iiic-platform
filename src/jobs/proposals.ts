import type { TaskConfig } from 'payload'

/**
 * The proposals' tasks (docs/17 §11, builder C), each named by its automation ID and idempotent
 * (CLAUDE.md): `P5-send-proposal` (the email with the tracked link, after the send commits) and
 * `P8-expire-proposals` (a proposal past its "valid until" day with no answer; P8 is proposed,
 * docs/17 §10). Builder C adds them here; their slugs join the jobs table's enum, so the merge's
 * one migration covers them (docs/17 §12).
 */
export const proposalTasks: TaskConfig[] = []
