import 'server-only'

import { payments } from '@/lib/payments/wiring'

import { makeOfficeActions, type OfficeActions } from './actions'

/** The app's office actions, on the payments module this deployment uses (src/lib/payments/wiring.ts). */
let instance: OfficeActions | undefined

export function officeActions(): OfficeActions {
  instance ??= makeOfficeActions({ payments: payments(), now: () => new Date() })
  return instance
}
