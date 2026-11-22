import 'server-only'

import { getPayload } from 'payload'

import { env } from '@/lib/env'
import { reportError } from '@/lib/monitoring/sentry'
import config from '@payload-config'

import { AnalyticsEvent, type AnalyticsEventInput } from './events'
import { clientAddress, sessionHash } from './session'

/**
 * Writes one funnel event (docs/04 `analytics_events`; docs/12 §7). What may be recorded without
 * consent, and nothing more (docs/12 §10): the event, the page, the register, whom it is for
 * where the step asks, the day's pseudonymous session code and the time. No address, browser,
 * referrer, query, cookie or identifier is stored, and no event links to a person.
 */
export async function recordEvent(
  input: AnalyticsEventInput,
  headers: Headers,
  now: Date = new Date(),
): Promise<void> {
  const event = AnalyticsEvent.parse(input)
  const payload = await getPayload({ config })
  await payload.create({
    collection: 'analytics-events',
    data: {
      ...event,
      sessionHash: sessionHash({
        secret: env().PAYLOAD_SECRET,
        now,
        address: clientAddress(headers),
        userAgent: headers.get('user-agent') ?? '',
      }),
      at: now.toISOString(),
      // Shown in India time in the admin (CLAUDE.md #8).
      at_tz: 'Asia/Kolkata',
    },
    overrideAccess: true,
  })
}

/**
 * Records an event without ever failing the request it belongs to: the caller schedules this
 * after its response (next/server's `after`), so a visitor never waits for it, and a failure is
 * logged by the error's name only and reported, never retried.
 */
export async function recordEventQuietly(
  input: AnalyticsEventInput,
  headers: Headers,
  now: Date = new Date(),
): Promise<void> {
  try {
    await recordEvent(input, headers, now)
  } catch (error) {
    console.error(
      `An analytics event was not recorded (${error instanceof Error ? error.name : 'unknown error'}).`,
    )
    await reportError(error, { task: 'analytics-event' })
  }
}
