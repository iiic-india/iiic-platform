import { z } from 'zod'

import { TURNSTILE_ORIGIN } from './turnstileOrigin'

export { TURNSTILE_ORIGIN, TURNSTILE_SCRIPT_URL } from './turnstileOrigin'

/**
 * Cloudflare Turnstile on the public forms (docs/08 §9; docs/17 §6), only where both its keys
 * are set (src/lib/env.ts). The widget's token is checked on the server with Cloudflare's
 * siteverify, with the person's address; a failed or unanswered check asks the person to send
 * the form again. Without the keys the forms rely on their trap, their timing and the rate
 * limits, and no request leaves for Cloudflare. No server-only import: the proxy reads the
 * origins, which are no secret; the check itself runs only in the forms' server action.
 */

const SITEVERIFY_URL = `${TURNSTILE_ORIGIN}/turnstile/v0/siteverify`

/** Turnstile's keys, when both are set; null otherwise. */
export function turnstileKeys(source: {
  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET_KEY?: string
}): { siteKey: string; secretKey: string } | null {
  const { TURNSTILE_SITE_KEY: siteKey, TURNSTILE_SECRET_KEY: secretKey } = source
  return siteKey && secretKey ? { siteKey, secretKey } : null
}

/**
 * What a page's policy needs for the widget where the keys are set (Cloudflare's CSP guidance):
 * its script, and the frame it draws the check in. Nothing where they are not, and nothing in
 * the admin, which has no public form.
 */
export function turnstileSources(
  pathname: string,
  enabled: boolean,
): { scriptOrigins: string[]; frameOrigins: string[] } {
  return enabled && !/^\/admin(?:\/|$)/i.test(pathname)
    ? { scriptOrigins: [TURNSTILE_ORIGIN], frameOrigins: [TURNSTILE_ORIGIN] }
    : { scriptOrigins: [], frameOrigins: [] }
}

/** Checks a widget's token: true only when Cloudflare says the person passed. */
export type TurnstileCheck = (token: string, address: string | null) => Promise<boolean>

const Answer = z.object({ success: z.boolean() })

/** A token as the widget gives it: Cloudflare's tokens are at most 2048 characters. */
export function isTokenShaped(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 2048
}

/** The real check, against Cloudflare's siteverify; any fault counts as not passed. */
export function siteverify(
  secretKey: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 5_000,
): TurnstileCheck {
  return async (token, address) => {
    const body = new URLSearchParams({ secret: secretKey, response: token })
    if (address) body.set('remoteip', address)
    try {
      const response = await fetchImpl(SITEVERIFY_URL, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) return false
      const answer = Answer.safeParse(await response.json())
      return answer.success && answer.data.success
    } catch {
      return false
    }
  }
}

/** For tests: passes the tokens given, refuses every other. */
export function fakeTurnstile(passing: readonly string[]): TurnstileCheck & { calls: string[] } {
  const calls: string[] = []
  const check = async (token: string) => {
    calls.push(token)
    return passing.includes(token)
  }
  return Object.assign(check, { calls })
}
