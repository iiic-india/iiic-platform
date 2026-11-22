import 'server-only'

import type { ServerEnv } from '@/lib/env'
import { err, ok, type Result } from '@/lib/result'

import { FakeGateway } from './fakeGateway'
import type { PaymentGateway } from './gateway'
import { RazorpayGateway } from './razorpay'

/**
 * The gateway this deployment uses (docs/16 §11), from the environment src/lib/env.ts has
 * already checked: Razorpay when its three keys are set (a live key only on production), the
 * in-memory fake when PAYMENT_GATEWAY=fake (locally and in CI, never on Vercel), and otherwise
 * none: payments are off, and every payment operation answers `not-configured` and says so,
 * while the rest of the app builds and runs (bookings confirm without payment, docs/16 §8).
 */

type Holder = { fake?: FakeGateway; razorpay?: { keyId: string; gateway: RazorpayGateway } }

// One per server process, so the fake's orders outlive a request (the e2e tests pay through it).
const holder = ((globalThis as { __iiicPaymentGateway?: Holder }).__iiicPaymentGateway ??= {})

export type NotConfigured = { code: 'not-configured' }

export function gatewayFor(config: ServerEnv): Result<PaymentGateway, NotConfigured> {
  if (config.PAYMENT_GATEWAY === 'fake') {
    holder.fake ??= config.RAZORPAY_WEBHOOK_SECRET
      ? new FakeGateway(config.RAZORPAY_WEBHOOK_SECRET)
      : new FakeGateway()
    return ok(holder.fake)
  }
  const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret } = config
  const webhookSecret = config.RAZORPAY_WEBHOOK_SECRET
  if (!keyId || !keySecret || !webhookSecret) return err({ code: 'not-configured' })
  if (holder.razorpay?.keyId !== keyId) {
    holder.razorpay = { keyId, gateway: new RazorpayGateway({ keyId, keySecret, webhookSecret }) }
  }
  return ok(holder.razorpay.gateway)
}

/** Whether this deployment takes payments, for the admin and the flow to say so. */
export function paymentsAvailable(config: ServerEnv): boolean {
  return gatewayFor(config).ok
}
