import { z } from 'zod'

import type { ServerEnv } from '@/lib/env'
import { err, ok, type Result } from '@/lib/result'

import type { CalendarProvider } from './provider'

/**
 * Whether the platform may reach Google Calendar, from the settings src/lib/env.ts validated
 * (D-22, D-23; docs/16 §7): a Workspace service account with domain-wide delegation limited to
 * the Calendar scopes, its key, and the Workspace domain whose calendars it may open. Without
 * them the calendar is switched off: nothing is read or written, and bookings work as before.
 *
 * Previews share production's database (docs/16 §10), so a Vercel deployment other than
 * production never writes to the practitioners' real calendars, whatever its settings say.
 */

export type GoogleCalendarConfig = {
  serviceAccountEmail: string
  privateKey: string
  /** The Workspace domain, lowercased: only calendars at this domain are opened. */
  workspaceDomain: string
  /** Change notifications are watched (B14) only once their token is set. */
  webhooksOn: boolean
}

type CalendarEnv = Pick<
  ServerEnv,
  | 'GOOGLE_WORKSPACE_DOMAIN'
  | 'GOOGLE_SERVICE_ACCOUNT_EMAIL'
  | 'GOOGLE_SERVICE_ACCOUNT_KEY'
  | 'GOOGLE_CALENDAR_WEBHOOK_TOKEN'
  | 'VERCEL_ENV'
>

export type CalendarOff = {
  code: 'not-configured'
  reason: 'missing' | 'invalid-key' | 'invalid-domain' | 'not-production'
}

/** The service account's key file, as Google issues it; only its private key is used. */
const KeyFile = z.object({
  private_key: z.string().includes('PRIVATE KEY'),
})

const Domain = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/^@/, ''))
  .pipe(z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/))

/** The key as .env.example asks for it (the JSON file in base64), or the JSON itself. */
function readKey(value: string): string | null {
  const trimmed = value.trim()
  let text = trimmed
  if (!trimmed.startsWith('{')) {
    text = Buffer.from(trimmed, 'base64').toString('utf8')
  }
  try {
    const parsed = KeyFile.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data.private_key : null
  } catch {
    return null
  }
}

export function googleCalendarConfig(env: CalendarEnv): Result<GoogleCalendarConfig, CalendarOff> {
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = env.GOOGLE_SERVICE_ACCOUNT_KEY
  const domain = env.GOOGLE_WORKSPACE_DOMAIN
  if (!email || !key || !domain) return err({ code: 'not-configured', reason: 'missing' })
  if (env.VERCEL_ENV && env.VERCEL_ENV !== 'production') {
    return err({ code: 'not-configured', reason: 'not-production' })
  }
  const workspaceDomain = Domain.safeParse(domain)
  if (!workspaceDomain.success) return err({ code: 'not-configured', reason: 'invalid-domain' })
  const privateKey = readKey(key)
  if (!privateKey) return err({ code: 'not-configured', reason: 'invalid-key' })
  return ok({
    serviceAccountEmail: email,
    privateKey,
    workspaceDomain: workspaceDomain.data,
    webhooksOn: Boolean(env.GOOGLE_CALENDAR_WEBHOOK_TOKEN),
  })
}

/**
 * What the calendar module runs with: the calendar, or why there is none, the platform's origin
 * (the host in UIDs and event ids, the feed links' address) and where Google posts change
 * notifications (none without the webhook token, or on a plain http origin). The server's own is
 * built in calendarFor.ts; tests pass a FakeCalendar.
 */
export type CalendarDeps = {
  provider: Result<CalendarProvider, CalendarOff>
  siteUrl: string
  webhookAddress: string | null
}

const Address = z.email()

/**
 * The Workspace user the service account acts as for a calendar: the practitioner's own address
 * on the Workspace domain (I-24). Any other calendar is refused, so delegation never reaches
 * outside IIIC's Workspace.
 */
export function calendarSubject(calendarId: string, workspaceDomain: string): string | null {
  const address = calendarId.trim().toLowerCase()
  if (!Address.safeParse(address).success) return null
  return address.endsWith(`@${workspaceDomain}`) ? address : null
}

/** Where Google posts change notifications; Google accepts only an https address. */
export function webhookAddress(siteUrl: string): string | null {
  const url = new URL(siteUrl)
  return url.protocol === 'https:' ? `${url.origin}/api/webhooks/google-calendar` : null
}
