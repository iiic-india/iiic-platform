import { createHmac, hkdfSync } from 'node:crypto'

import { istDay } from '@/lib/time/ist'

/**
 * The pseudonymous session of an analytics event (docs/04 `analytics_events`; docs/12 §7, §10): a
 * code that is the same for one browser at one address through one day in India, so the funnel
 * can follow a visit from step to step, and different the next day. Nothing is stored in the
 * browser and no cookie is set: the code is worked out on the server from the request, and the
 * address and the browser it is worked out from are never kept.
 *
 * Each day has a key of its own, derived by HKDF from the server's secret and the date, and the
 * code is an HMAC of the address and the browser under that key. Without the secret nobody can
 * work out a code, and one day's codes say nothing about another day's. With it, a past day's code
 * can be worked out again for a known address and browser: the code is pseudonymous, not
 * anonymous (docs/08 §3, Children).
 */

const INFO = 'iiic/analytics-session/v1'

/** A day's key: derived from the server's secret and the day, as YYYY-MM-DD in India. */
export function dayKey(secret: string, day: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, day, INFO, 32))
}

/** The session code of a request at a moment: 32 hexadecimal characters (128 bits). */
export function sessionHash({
  secret,
  now,
  address,
  userAgent,
}: {
  secret: string
  now: Date
  address: string
  userAgent: string
}): string {
  // As a JSON pair, so that no address and browser can be read as another pair.
  return createHmac('sha256', dayKey(secret, istDay(now)))
    .update(JSON.stringify([address, userAgent]))
    .digest('hex')
    .slice(0, 32)
}

/**
 * The client's address as Vercel passes it: the first `x-forwarded-for` entry, which Vercel
 * sets itself, or `x-real-ip`. Empty when neither is there (a local server).
 */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers.get('x-real-ip')?.trim() || ''
}
