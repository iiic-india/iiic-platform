// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AnalyticsBeacon } from '@/components/site/AnalyticsBeacon'
import {
  BEACON_REPORT_ORIGIN,
  BEACON_SCRIPT_ORIGIN,
  BEACON_SCRIPT_URL,
  beaconSources,
  beaconToken,
  countsPath,
} from '@/lib/analytics/beacon'
import { nonceFrom } from '@/lib/security/csp'

// Cloudflare Web Analytics' beacon (docs/12 §2, §7, §10): nothing at all while its token is
// unset (CI and local runs), and once it is set, one deferred script with the request's nonce on
// the public pages, never in the admin. The token below is obviously fake.
const TOKEN = '0123456789abcdef0123456789abcdef'
const request = vi.hoisted(() => ({ headers: new Map<string, string>() }))
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => request.headers.get(name) ?? null }),
}))

/** A request as the proxy hands it on: its path and its policy with a nonce. */
function requestFor(path: string, nonce: string | null = 'fakeNonce0123456789AB==') {
  request.headers = new Map([['x-pathname', path]])
  if (nonce) request.headers.set('content-security-policy', `script-src 'self' 'nonce-${nonce}'`)
}

const draw = async () => renderToStaticMarkup((await AnalyticsBeacon()) ?? <></>)

afterEach(() => {
  delete process.env.NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN
})

describe('the beacon', () => {
  it('is not on any page while the token is unset', async () => {
    requestFor('/')
    expect(await draw()).toBe('')
    expect(beaconToken()).toBeNull()
    expect(beaconSources('/')).toEqual({ scriptOrigins: [], connectOrigins: [] })
  })

  it('loads deferred, with the request’s nonce and the token, once the token is set', async () => {
    process.env.NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN = TOKEN
    requestFor('/framework')
    const html = await draw()
    expect(html).toBe(
      `<script defer="" src="${BEACON_SCRIPT_URL}" data-cf-beacon="{&quot;token&quot;:&quot;${TOKEN}&quot;}" nonce="fakeNonce0123456789AB=="></script>`,
    )
    expect(beaconSources('/framework')).toEqual({
      scriptOrigins: [BEACON_SCRIPT_ORIGIN],
      connectOrigins: [BEACON_REPORT_ORIGIN],
    })
  })

  it('is never in the admin, and never without a nonce', async () => {
    process.env.NEXT_PUBLIC_CF_WEB_ANALYTICS_TOKEN = TOKEN
    for (const path of ['/admin', '/admin/login', '/ADMIN/collections/pages']) {
      requestFor(path)
      expect(await draw(), path).toBe('')
      expect(countsPath(path), path).toBe(false)
      expect(beaconSources(path).scriptOrigins, path).toEqual([])
    }
    expect(countsPath('/administration')).toBe(true)
    requestFor('/', null)
    expect(await draw()).toBe('')
  })

  it('takes only a token of a token’s shape, so nothing can leave its attribute', () => {
    for (const value of ['', '   ', 'short', `${TOKEN}"><script>`, `${TOKEN} x`, undefined]) {
      expect(beaconToken(value), String(value)).toBeNull()
    }
    expect(beaconToken(` ${TOKEN} `)).toBe(TOKEN)
  })

  it('reads the nonce the proxy put in the policy', () => {
    expect(nonceFrom("default-src 'self'; script-src 'self' 'nonce-a+b/c=' 'strict-dynamic'")).toBe(
      'a+b/c=',
    )
    expect(nonceFrom("script-src 'self'")).toBeUndefined()
    expect(nonceFrom(null)).toBeUndefined()
  })
})
