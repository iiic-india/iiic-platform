import 'server-only'

import { err } from '@/lib/result'

import type { CoreProvider } from './core'

/**
 * Where the B-series tasks find the messaging core (docs/19 §3, §12). Builder A writes `deliver`
 * and `cancelQueued` in `src/lib/messaging/`; until the branches are joined they are not here, so
 * a task answers `core-not-wired` and its job fails visibly instead of losing a message in
 * silence. At the join the lead replaces the body with A's two functions:
 *
 *   const { deliver, cancelQueued } = await import('@/lib/messaging/deliver')
 *   return ok({ deliver, cancelQueued })
 */
export const messagingCore: CoreProvider = async () => err({ code: 'core-not-wired' })
