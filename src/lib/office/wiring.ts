import 'server-only'

import { env } from '@/lib/env'
import { channelsFor } from '@/lib/messaging/channelsFor'
import { payments } from '@/lib/payments/wiring'

import { makeOfficeActions, type OfficeActions } from './actions'

/**
 * The app's office actions, on the payments module this deployment uses (src/lib/payments/wiring.ts)
 * and the messages it can send (src/lib/messaging/channelsFor.ts: email set up here or not).
 */
let instance: OfficeActions | undefined

export function officeActions(): OfficeActions {
  instance ??= makeOfficeActions({
    payments: payments(),
    now: () => new Date(),
    messagesSetUp: () => channelsFor(env()).configured.email,
  })
  return instance
}
