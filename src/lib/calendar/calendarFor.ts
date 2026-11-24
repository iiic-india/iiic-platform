import 'server-only'

import type { PayloadRequest } from 'payload'

import { env } from '@/lib/env'
import { err, ok, type Result } from '@/lib/result'

import { googleCalendarConfig, webhookAddress, type CalendarDeps, type CalendarOff } from './config'
import { GoogleCalendar } from './google'
import type { CalendarProvider, RefreshBusyBlocks, SyncBookingEvent } from './provider'
import { refreshBusyBlocksWith, sweepCalendarsWith, syncBookingEventWith } from './sync'

/**
 * The calendar this server runs with: Google Calendar when src/lib/env.ts holds its settings
 * (config.ts), and none otherwise, in which case every calendar step answers `not-configured`
 * and bookings go on without it. Read once per server.
 */
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

/** The contracts in provider.ts, on this server's calendar. */
export const syncBookingEvent: SyncBookingEvent = (req, input) =>
  syncBookingEventWith(calendarDeps(), req, input)

export const refreshBusyBlocks: RefreshBusyBlocks = (req, input) =>
  refreshBusyBlocksWith(calendarDeps(), req, input)

export const sweepCalendars = (req: PayloadRequest, now: Date) =>
  sweepCalendarsWith(calendarDeps(), req, now)
