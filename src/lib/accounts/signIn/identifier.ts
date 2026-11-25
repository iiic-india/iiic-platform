import { createHmac, hkdfSync } from 'node:crypto'

import { z } from 'zod'

import { formatPhone, toE164 } from '@/lib/phone'

import type { SignInChannel } from '../contract'

/**
 * The address a person types at sign-in (docs/20 §4.1, §4.8): read the way the rest of the
 * platform stores it (an email in small letters, a mobile in E.164, CLAUDE.md #8), shown back
 * masked, and counted by a keyed hash so `sign-in-requests` never holds it (D-116).
 */

const EmailShape = z.email().max(254)

/** The address as stored and compared, or null when it is not one for the channel. */
export function normaliseIdentifier(channel: SignInChannel, raw: string): string | null {
  const typed = raw.trim()
  if (channel === 'email') {
    const lower = typed.toLowerCase()
    return EmailShape.safeParse(lower).success ? lower : null
  }
  return toE164(typed)
}

const DOT = '•'

/**
 * The address as the code step shows it: enough for the person to recognise it, too little to
 * learn it from a glance at the screen. `a••••@gmail.com`, `+91 ••••• •0000`.
 */
export function maskIdentifier(channel: SignInChannel, value: string): string {
  if (channel === 'email') {
    const at = value.lastIndexOf('@')
    if (at < 1) return DOT.repeat(4)
    return `${value[0]}${DOT.repeat(4)}${value.slice(at)}`
  }
  // "+91 90000 00000": the country code stays, then every digit but the last four is hidden.
  const formatted = formatPhone(value)
  const space = formatted.indexOf(' ')
  if (space < 0) return `${value.slice(0, 3)}${DOT.repeat(6)}${value.slice(-4)}`
  const rest = formatted.slice(space)
  const digits = (rest.match(/\d/g) ?? []).length
  let seen = 0
  return `${formatted.slice(0, space)}${rest.replace(/\d/g, (digit) => (++seen <= digits - 4 ? DOT : digit))}`
}

const IDENTIFIER_INFO = 'iiic/sign-in-identifier/v1'

/** The key the address is hashed under: from BETTER_AUTH_SECRET, for this alone. */
function identifierKey(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, '', IDENTIFIER_INFO, 32))
}

/**
 * What `sign-in-requests` keeps of the address: an HMAC, 64 hexadecimal characters, the same for
 * the same address on the same channel, and useless to anyone without the secret.
 */
export function identifierHash(secret: string, channel: SignInChannel, value: string): string {
  return createHmac('sha256', identifierKey(secret)).update(`${channel}:${value}`).digest('hex')
}
