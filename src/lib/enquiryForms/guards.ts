import 'server-only'

import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto'

import { istDay } from '@/lib/time/ist'

import type { EnquiryFormKind } from './strings'

/**
 * The guards every public form has, with or without Turnstile (docs/17 §6; docs/08 §9):
 * - the time the form was drawn, signed with a key derived from the server's secret, so a
 *   submission sent within three seconds of the page, or with a time nobody signed, is a robot's;
 * - the submitter hash, a keyed hash of the network address under a key of the day, which the
 *   rate limits count by. The address itself is never stored. The key is derived as the
 *   analytics session's is (src/lib/analytics/session.ts), under a label of its own, so the two
 *   codes cannot be matched with each other.
 */

/** A person cannot read and fill a form faster than this. */
export const MIN_FILL_MS = 3_000

const DRAWN_INFO = 'iiic/enquiry-form-drawn/v1'
const SUBMITTER_INFO = 'iiic/enquiry-submitter/v1'

function drawnKey(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, '', DRAWN_INFO, 32))
}

function signature(secret: string, kind: EnquiryFormKind, at: number): string {
  return createHmac('sha256', drawnKey(secret)).update(`${kind}.${at}`).digest('base64url')
}

/** The signed time a form is drawn at, for its hidden field: milliseconds, then the signature. */
export function signDrawn(secret: string, kind: EnquiryFormKind, now: Date): string {
  const at = now.getTime()
  return `${at}.${signature(secret, kind, at)}`
}

export type DrawnCheck = 'ok' | 'too-fast' | 'unsigned'

/**
 * Whether a form's drawn time is one the server signed for this form, at least three seconds
 * ago. Checked against the secret and, while it is being rotated, the one it replaced.
 */
export function checkDrawn(
  value: unknown,
  kind: EnquiryFormKind,
  now: Date,
  secrets: readonly string[],
): DrawnCheck {
  if (typeof value !== 'string') return 'unsigned'
  const match = /^(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(value)
  if (!match) return 'unsigned'
  const at = Number(match[1])
  const given = Buffer.from(match[2] as string)
  const signed = secrets.some((secret) => {
    const expected = Buffer.from(signature(secret, kind, at))
    return expected.length === given.length && timingSafeEqual(expected, given)
  })
  if (!signed || at > now.getTime()) return 'unsigned'
  return now.getTime() - at < MIN_FILL_MS ? 'too-fast' : 'ok'
}

/** The day's key for the submitter hash: from the server's secret and the day in India. */
function submitterKey(secret: string, day: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, day, SUBMITTER_INFO, 32))
}

/** The submitter hash of an address at a moment: 32 hexadecimal characters. */
export function submitterHash(secret: string, address: string, now: Date): string {
  return createHmac('sha256', submitterKey(secret, istDay(now)))
    .update(address)
    .digest('hex')
    .slice(0, 32)
}

/**
 * The hashes an address had over the last hour: one, or two when the hour began on the day
 * before in India, so that the hourly limit does not start again at midnight.
 */
export function submitterHashesWithin(
  secret: string,
  address: string,
  now: Date,
  windowMs: number,
): string[] {
  const earlier = new Date(now.getTime() - windowMs)
  return [...new Set([submitterHash(secret, address, now), submitterHash(secret, address, earlier)])]
}
