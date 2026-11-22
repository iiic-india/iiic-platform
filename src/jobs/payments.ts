import type { TaskConfig } from 'payload'

/**
 * The payments module's tasks (docs/16 §12, builder B): the order-status poll and the daily
 * reconciliation (B11), which M3 owns. Each is named by its automation ID and is idempotent.
 */
export const paymentTasks: TaskConfig[] = []
