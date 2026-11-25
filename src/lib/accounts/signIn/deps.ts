import 'server-only'

import { cookies, headers } from 'next/headers'
import type { PayloadRequest } from 'payload'

import type { TurnstileCheck } from '@/lib/enquiryForms/turnstile'
import { siteverify, turnstileKeys } from '@/lib/enquiryForms/turnstile'
import { env, type ServerEnv } from '@/lib/env'
import { deliver } from '@/lib/messaging/deliver'
import type { Deliver } from '@/lib/messaging/operations'
import { readFlags } from '@/lib/settings/source'

import type { CookieJar } from './cookie'
import { deploymentGate } from './gate'
import { customerAuthFor, type CustomerAuth } from '../auth/instance'

/**
 * What the sign-in steps need from the world, passed in so the integration tests can give their
 * own (docs/20 §11): the environment, Better Auth, the request's headers and cookie store,
 * Turnstile where its keys are set, and the messaging core's `deliver`. `nextSignInDeps` is the
 * real one, for a server action: Next.js's `headers()` and `cookies()`.
 */
export type SignInEnv = Pick<
  ServerEnv,
  | 'VERCEL_ENV'
  | 'BETTER_AUTH_SECRET'
  | 'siteUrl'
  | 'MESSAGING_TRANSPORT'
  | 'RESEND_API_KEY'
  | 'WHATSAPP_API_KEY'
>

export type SignInDeps = {
  env: SignInEnv
  auth: CustomerAuth
  /** The request's headers: its cookies for Better Auth, its user agent, its network address. */
  headers: Headers
  jar: CookieJar
  /** Cloudflare's check where both keys are set; null otherwise. */
  turnstile: TurnstileCheck | null
  deliver: Deliver
}

/** The secret, once the gate has said it is set. */
export const secretOf = (deps: SignInDeps): string => deps.env.BETTER_AUTH_SECRET as string

/** Cookies are Secure over HTTPS (docs/20 §10). */
export const secureCookies = (deps: Pick<SignInDeps, 'env'>): boolean =>
  deps.env.siteUrl.startsWith('https://')

/**
 * Whether sign-in may act here and now: production, local or CI, with the secret, and the
 * `accountsEnabled` flag on (docs/20 §4.9). The environment is asked first, so a preview reads
 * nothing at all.
 */
export async function signInOpen(
  req: PayloadRequest,
  settings: SignInEnv = env(),
): Promise<boolean> {
  if (deploymentGate(settings) !== 'open') return false
  return (await readFlags(req.payload)).accountsEnabled
}

/** Next.js's cookie store as the sign-in cookie's jar (a server action may write it). */
export function nextJar(store: Awaited<ReturnType<typeof cookies>>): CookieJar {
  return {
    get: (name) => store.get(name)?.value,
    set: (name, value, options) => {
      store.set(name, value, options)
    },
    delete: (name, options) => {
      store.delete({ name, path: options.path, secure: options.secure })
    },
  }
}

/** The real dependencies, inside a server action; null where Better Auth is not set up. */
export async function nextSignInDeps(req: PayloadRequest): Promise<SignInDeps | null> {
  const settings = env()
  const auth = customerAuthFor(req.payload, settings)
  if (!auth) return null
  const keys = turnstileKeys(settings)
  return {
    env: settings,
    auth,
    headers: await headers(),
    jar: nextJar(await cookies()),
    turnstile: keys ? siteverify(keys.secretKey) : null,
    deliver,
  }
}
