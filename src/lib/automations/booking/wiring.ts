import 'server-only'

import { ok } from '@/lib/result'

import type { CoreProvider } from './core'

/**
 * Where the B-series tasks find the messaging core (docs/19 §3, §12): builder A's `deliver` and
 * `cancelQueued` (src/lib/messaging/deliver.ts), joined at the M6 merge. They are loaded when a
 * task runs, never when the jobs config loads, because they are server-only and the Payload CLI
 * reads the config too. Tests pass their own core through the task's deps.
 */
export const messagingCore: CoreProvider = async () => {
  const { deliver, cancelQueued } = await import('@/lib/messaging/deliver')
  return ok({ deliver, cancelQueued })
}
