import 'server-only'

import type { EmitDomainEvent } from '@/lib/booking/events'
import type { ConfirmBooking } from '@/lib/booking/operations'
import { env } from '@/lib/env'

import { gatewayFor } from './gatewayFor'
import { makePayments, type Payments } from './service'

/**
 * The app's payments module, joined to the gateway this deployment uses and to the booking
 * module (docs/16 §12). The booking module is built on its own branch (builder A) at the same
 * time as this one, so its two functions are joined at merge:
 *
 *   MERGE (lead): replace the two stand-ins below with
 *     import { confirmBooking } from '@/lib/booking/confirm'
 *     import { emit } from '@/lib/booking/emit'
 *
 * Until then a capture cannot confirm a booking, and the stand-in says so by failing: the
 * webhook answers 500 and Razorpay sends the event again later, so no payment is lost or
 * half-processed. The `emit` stand-in queues nothing, which is what the real one does until M6
 * subscribes its automations (docs/16 §9).
 */

const confirmBookingNotJoined: ConfirmBooking = async () => {
  throw new Error('The booking module is not joined to the payments module yet (docs/16 §12).')
}

const emitNotJoined: EmitDomainEvent = async () => {}

let instance: Payments | undefined

export function payments(): Payments {
  instance ??= makePayments({
    gateway: () => gatewayFor(env()),
    confirmBooking: confirmBookingNotJoined,
    emit: emitNotJoined,
    now: () => new Date(),
  })
  return instance
}
