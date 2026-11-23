import type { TaskConfig } from 'payload'

/**
 * The CRM's tasks (docs/17 §11, builder A), each named by its automation ID and idempotent
 * (CLAUDE.md): `P2-lead-from-call` (a proposal call booked creates or updates its lead, on
 * `booking.confirmed`) and `P3-P4-lead-alerts` (the first-reply clock and staleness, raised once
 * each). Builder A adds them here; their slugs join the jobs table's enum, so the merge's one
 * migration covers them (docs/17 §12). The CRM module is server-only: import it when a task runs.
 */
export const pipelineTasks: TaskConfig[] = []
