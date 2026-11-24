import { z } from 'zod'

/**
 * Cloudflare Web Analytics (docs/12 §2, §7, §10; D-14, D-30): traffic counted by a deferred
 * beacon that sets no cookie and keeps no personal data. It loads only where the site's token is
 * set (NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN, from Cloudflare's dashboard; it is public, as the
 * beacon sends it from every page), so CI and local runs make no third-party request, and only
 * on the public pages, never in the admin. The Content-Security-Policy names its two origins
 * only then (src/proxy.ts), and the script carries the request's nonce
 * (src/components/site/AnalyticsBeacon.tsx).
 */

/** The beacon's script, and where it sends what it counts (Cloudflare's CSP guidance). */
export const BEACON_SCRIPT_URL = 'https://static.cloudflareinsights.com/beacon.min.js'
export const BEACON_SCRIPT_ORIGIN = 'https://static.cloudflareinsights.com'
export const BEACON_REPORT_ORIGIN = 'https://cloudflareinsights.com'

/** A site token as Cloudflare issues it: letters and digits, nothing that could leave an attribute. */
const TOKEN = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{16,64}$/)

/** The token, if one is set and has a token's shape; anything else counts as unset. */
export function beaconToken(
  value: string | undefined = process.env.NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN,
): string | null {
  const parsed = TOKEN.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * The pages never counted: the admin, the booking pages whose address carries a manage link's
 * token or a booking's reference (`/b/<token>`, `/book/pay/<ref>`, `/book/confirmed/<ref>`,
 * docs/16 §6), and a proposal's tracked link (`/p/<token>`, docs/17 §5), since the beacon reports
 * the path and an address that is a key must never reach a third party.
 */
const UNCOUNTED = /^\/(?:admin(?:\/|$)|b\/|book\/(?:pay|confirmed)\/|p(?:\/|$))/i

/** Whether a path is one of the public pages the beacon may count. */
export function countsPath(pathname: string): boolean {
  return !UNCOUNTED.test(pathname)
}

/** What the beacon adds to a page's policy: its two origins where it loads, nothing elsewhere. */
export function beaconSources(
  pathname: string,
  token: string | null = beaconToken(),
): { scriptOrigins: string[]; connectOrigins: string[] } {
  return token && countsPath(pathname)
    ? { scriptOrigins: [BEACON_SCRIPT_ORIGIN], connectOrigins: [BEACON_REPORT_ORIGIN] }
    : { scriptOrigins: [], connectOrigins: [] }
}

/** The beacon's settings attribute, as Cloudflare's snippet writes it. */
export function beaconSettings(token: string): string {
  return JSON.stringify({ token })
}
