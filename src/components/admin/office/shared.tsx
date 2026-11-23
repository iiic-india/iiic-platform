import { redirect } from 'next/navigation'
import type { PayloadRequest } from 'payload'

import { formatIstDate } from '@/lib/time/ist'

/** The label a status list gives a value, or the value itself. */
export function labelOf(
  list: readonly { value: string; label: string }[],
  value: string | null | undefined,
): string {
  return list.find((entry) => entry.value === value)?.label ?? value ?? ''
}

/**
 * A custom admin view is public unless it checks for itself (CLAUDE.md #6): no session goes to
 * the sign-in, and a session without the two-factor code to the admin's start, which asks for it.
 * The role is each view's own check, after this.
 */
export function requireStaffWithCode(req: PayloadRequest): void {
  const {
    routes: { admin },
    serverURL = '',
  } = req.payload.config
  if (!req.user) redirect(`${serverURL}${admin}/login`)
  if ((req.user as { _strategy?: string })._strategy !== 'totp') redirect(`${serverURL}${admin}`)
}

/** A day written YYYY-MM-DD, as VOICE.md writes dates: 6 November 2026. */
export function formatDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return formatIstDate(new Date(Date.UTC(year as number, (month as number) - 1, date, 6, 30)))
}

/** A time field's value for a `datetime-local` input, in India time (YYYY-MM-DDTHH:MM). */
export const DATETIME_STEP_SECONDS = 300
