import type { TaskConfig } from 'payload'

/**
 * The booking engine's tasks (docs/16 §12, builder A): the sweep that moves holds past their time
 * to `expired` (B4). Each is named by its automation ID and is idempotent (CLAUDE.md).
 */
export const bookingTasks: TaskConfig[] = []
