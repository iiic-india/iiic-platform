import 'server-only'

import { env } from '@/lib/env'
import type { Result } from '@/lib/result'
import { err, ok } from '@/lib/result'

import { googleCalendarConfig, webhookAddress, type CalendarOff } from './config'
import { GoogleCalendar } from './google'
import type { CalendarProvider } from './provider'

/**
 * What the calendar module runs with on this server: Google Calendar when src/lib/env.ts holds
 * its settings (config.ts), and nothing otherwise, in which case every calendar step answers
 * `not-configured` and a booking goes on without it. Tests pass a FakeCalendar to the functions
 * in sync.ts and feed.ts instead of reading this.
 */
export type CalendarDeps = {
  /** The calendar, or why there is none. */
  provider: Result<CalendarProvider, CalendarOff>
  /** The platform's origin: the host in UIDs and event ids, and the feed links' address. */
  siteUrl: string
  /** Where Google posts change notifications, or none (no token, or not https). */
  webhookAddress: string | null
}

let cached: CalendarDeps | undefined

export function calendarDeps(): CalendarDeps {
  if (cached) return cached
  const settings = env()
  const config = googleCalendarConfig(settings)
  const provider: Result<CalendarProvider, CalendarOff> = config.ok
    ? ok(new GoogleCalendar(config.value, new URL(settings.siteUrl).hostname))
    : err(config.error)
  cached = {
    provider,
    siteUrl: settings.siteUrl,
    webhookAddress: config.ok && config.value.webhooksOn ? webhookAddress(settings.siteUrl) : null,
  }
  return cached
}
