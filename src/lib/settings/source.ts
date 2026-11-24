import type { Payload, PayloadRequest } from 'payload'

import { toFlags, type Flags } from './flags'
import { toLegalInformation, type LegalInformation } from './legal'
import { DEFAULT_QUIET_HOURS, minutesOf, type QuietHours } from './quietHours'

/**
 * Reads parts of the settings global (src/globals/Settings.ts) past its owner-only rule, each
 * reader asking for its own fields only: the legal information is public on /legal and in the
 * footer, and the flags and quiet hours steer the server. Nothing else in the settings, such as
 * the bank details, leaves through these. A global nobody has saved yet reads as its defaults.
 */

/** The legal information, with the latest dark-pattern audit's certificate (docs/08 §4). */
export async function readLegalInformation(payload: Payload): Promise<LegalInformation> {
  const settings = await payload.findGlobal({
    slug: 'settings',
    select: { legal: true, darkPatternAudits: true },
    // The certificate is a media file: one level down gives its address.
    depth: 1,
    overrideAccess: true,
  })
  return toLegalInformation(settings)
}

/**
 * The feature flags. Given the request, they are read on its transaction's connection: a caller
 * that holds a transaction must pass it, or it waits for a second connection from a pool that
 * concurrent requests may have emptied (src/payload.config.ts).
 */
export async function readFlags(payload: Payload, req?: PayloadRequest): Promise<Flags> {
  const settings = await payload.findGlobal({
    slug: 'settings',
    select: { flags: true },
    depth: 0,
    overrideAccess: true,
    ...(req ? { req } : {}),
  })
  return toFlags(settings)
}

export async function readQuietHours(payload: Payload): Promise<QuietHours> {
  const settings = await payload.findGlobal({
    slug: 'settings',
    select: { quietHours: true },
    depth: 0,
    overrideAccess: true,
  })
  const stored = (settings as { quietHours?: Partial<QuietHours> | null }).quietHours
  return {
    start:
      minutesOf(stored?.start) === null ? DEFAULT_QUIET_HOURS.start : (stored?.start as string),
    end: minutesOf(stored?.end) === null ? DEFAULT_QUIET_HOURS.end : (stored?.end as string),
  }
}
