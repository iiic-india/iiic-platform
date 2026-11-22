import { headers } from 'next/headers'

import { BEACON_SCRIPT_URL, beaconSettings, beaconToken, countsPath } from '@/lib/analytics/beacon'
import { nonceFrom } from '@/lib/security/csp'

/**
 * Cloudflare Web Analytics' beacon (docs/12 §2, §7, §10; src/lib/analytics/beacon.ts): deferred,
 * cookieless, with the request's nonce, so the page's policy lets it run. Drawn only where the
 * site's token is set and only on the public pages (the admin has a layout of its own, and the
 * path is checked again here); without a token, or without a nonce, there is nothing at all.
 */
export async function AnalyticsBeacon() {
  const token = beaconToken()
  if (!token) return null
  const request = await headers()
  if (!countsPath(request.get('x-pathname') ?? '/')) return null
  const nonce = nonceFrom(request.get('content-security-policy'))
  if (!nonce) return null
  return (
    <script defer src={BEACON_SCRIPT_URL} data-cf-beacon={beaconSettings(token)} nonce={nonce} />
  )
}
