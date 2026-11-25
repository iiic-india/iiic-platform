import { hkdfSync } from 'node:crypto'

import { EncryptJWT, jwtDecrypt } from 'jose'
import { z } from 'zod'

import { ADD_DETAIL_COOKIE, SIGN_IN_CHANNELS, SIGN_IN_COOKIE } from '../contract'

/**
 * The sign-in cookie (docs/20 §10; docs/12 §10): one sign-in carried from the address step to the
 * code step and, for a new address, to the account step. A JWE (dir, A256GCM) under a key derived
 * from BETTER_AUTH_SECRET for this alone, so the browser holds it without being able to read or
 * change it. It holds the channel, the address, the `sign-in-requests` row, when the code went
 * and, once a right code has proven an address with no account, when it was proven and whether
 * the device is to be kept. Never the code. HttpOnly, Secure over HTTPS, SameSite=Lax, path
 * /login, fifteen minutes; cleared on sign-in and by "Use a different address". A second detail's
 * attempt travels the same way in a cookie of its own, on /account (`attemptCookie`; D-129).
 */

export const Attempt = z.strictObject({
  v: z.literal(1),
  purpose: z.enum(['signIn', 'addDetail']),
  channel: z.enum(SIGN_IN_CHANNELS),
  address: z.string().min(3).max(254),
  requestId: z.number().int().positive(),
  /** When the latest code went (milliseconds). */
  sentAt: z.number().int().positive(),
  /** When a right code proved an address that has no account yet (the account step follows). */
  provenAt: z.number().int().positive().optional(),
  /** "Keep me signed in", as ticked at the code step, for the session the account step starts. */
  trustDevice: z.boolean().optional(),
  /** A second detail: the account it is for (docs/20 §4.6). */
  accountId: z.number().int().positive().optional(),
  /** Where to go after signing in: a path under /account only. */
  next: z.string().max(200).optional(),
})
export type Attempt = z.infer<typeof Attempt>

const COOKIE_INFO = 'iiic/sign-in-cookie/v1'

function cookieKey(secret: string): Uint8Array {
  return new Uint8Array(hkdfSync('sha256', secret, '', COOKIE_INFO, 32))
}

/**
 * The cookie each purpose's attempt travels in (docs/12 §10; D-129): a sign-in's on /login, a
 * second detail's under a name of its own on /account. Each reader names the one it reads, so an
 * attempt of one purpose never answers for the other.
 */
export const attemptCookie = (purpose: Attempt['purpose']) =>
  purpose === 'addDetail' ? ADD_DETAIL_COOKIE : SIGN_IN_COOKIE

/** The sealed value, good for fifteen minutes from `now`. */
export async function sealAttempt(secret: string, attempt: Attempt, now: Date): Promise<string> {
  const issued = Math.floor(now.getTime() / 1000)
  return new EncryptJWT({ attempt })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt(issued)
    .setExpirationTime(issued + attemptCookie(attempt.purpose).maxAgeSeconds)
    .encrypt(cookieKey(secret))
}

/** The attempt a sealed value holds, or null: unsealed, changed, run out or of another shape. */
export async function openAttempt(
  secret: string,
  sealed: string | undefined,
  now: Date,
): Promise<Attempt | null> {
  if (!sealed || sealed.length > 4096) return null
  try {
    const { payload } = await jwtDecrypt(sealed, cookieKey(secret), {
      currentDate: now,
      keyManagementAlgorithms: ['dir'],
      contentEncryptionAlgorithms: ['A256GCM'],
    })
    const parsed = Attempt.safeParse(payload.attempt)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Where the sign-in cookie is read and written: Next.js's cookie store, or a test's own. */
export type CookieJar = {
  get: (name: string) => string | undefined
  set: (
    name: string,
    value: string,
    options: {
      httpOnly: boolean
      secure: boolean
      sameSite: 'lax'
      path: string
      maxAge: number
    },
  ) => void
  delete: (name: string, options: { path: string; secure: boolean }) => void
}

/** The attempt of this purpose, from its own cookie; null when that cookie holds no such attempt. */
export async function readAttempt(
  jar: CookieJar,
  secret: string,
  now: Date,
  purpose: Attempt['purpose'],
): Promise<Attempt | null> {
  const attempt = await openAttempt(secret, jar.get(attemptCookie(purpose).name), now)
  return attempt?.purpose === purpose ? attempt : null
}

export async function writeAttempt(
  jar: CookieJar,
  secret: string,
  attempt: Attempt,
  now: Date,
  secure: boolean,
): Promise<void> {
  const cookie = attemptCookie(attempt.purpose)
  jar.set(cookie.name, await sealAttempt(secret, attempt, now), {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: cookie.path,
    maxAge: cookie.maxAgeSeconds,
  })
}

export function clearAttempt(jar: CookieJar, secure: boolean, purpose: Attempt['purpose']): void {
  const cookie = attemptCookie(purpose)
  jar.delete(cookie.name, { path: cookie.path, secure })
}

/** `next` is kept only when it is a path under /account (docs/20 §3.5). */
export function safeNext(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return /^\/account(?:\/[A-Za-z0-9/_-]*)?$/.test(value) && !value.includes('//')
    ? value
    : undefined
}
