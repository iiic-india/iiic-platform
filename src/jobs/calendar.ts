import type { TaskConfig } from 'payload'

/**
 * The calendar module's tasks (docs/16 §12, builder C): refreshing busy times and renewing watch
 * channels (B14), and writing a booking's event to its practitioner's calendar. Each is named by
 * its automation ID and is idempotent.
 */
export const calendarTasks: TaskConfig[] = []
