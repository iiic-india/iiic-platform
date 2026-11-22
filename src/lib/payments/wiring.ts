import 'server-only'

import { confirmBooking } from '@/lib/booking/confirm'
import { emit } from '@/lib/booking/emit'
import { env } from '@/lib/env'

import { gatewayFor } from './gatewayFor'
import { makePayments, type Payments } from './service'

/**
 * The app's payments module, joined to the gateway this deployment uses and to the booking
 * module's ConfirmBooking and `emit` (docs/16 §12). ConfirmBooking writes under the booking
 * module's savepoint guard, so a time the exclusion constraint refuses answers `slot-taken` and
 * leaves this module's transaction open for the B10 refund.
 */

let instance: Payments | undefined

export function payments(): Payments {
  instance ??= makePayments({
    gateway: () => gatewayFor(env()),
    confirmBooking,
    emit,
    now: () => new Date(),
  })
  return instance
}
