import { describe, expect, it } from 'vitest'

import {
  headerRules,
  PRIVATE_ROUTES,
  ROUTE_EXCEPTIONS,
  SECURITY_HEADERS,
  STATIC_ASSETS,
  withoutColorSchemeHints,
} from '@/lib/security/headers'

const keys = (headers: { key: string }[]) => headers.map((header) => header.key)

describe('headerRules', () => {
  it('sends the security headers on every route', () => {
    for (const vercelEnv of ['production', 'preview', undefined]) {
      const [everyRoute] = headerRules(vercelEnv)
      expect(everyRoute?.source).toBe('/:path*')
      expect(everyRoute?.headers).toEqual(expect.arrayContaining([...SECURITY_HEADERS]))
    }
  })

  it('keeps every deployment but production out of search engines', () => {
    for (const vercelEnv of ['preview', 'development', undefined]) {
      const rules = headerRules(vercelEnv)
      expect(keys(rules[0]?.headers ?? [])).toContain('X-Robots-Tag')
    }
  })

  it('lets production be indexed, except its private routes', () => {
    const [everyRoute, ...rest] = headerRules('production')
    const privateRoutes = rest.slice(0, PRIVATE_ROUTES.length)
    expect(keys(everyRoute?.headers ?? [])).not.toContain('X-Robots-Tag')
    expect(privateRoutes.map((rule) => rule.source)).toEqual([...PRIVATE_ROUTES])
    for (const rule of privateRoutes) {
      expect(rule.headers).toEqual([{ key: 'X-Robots-Tag', value: 'noindex' }])
    }
  })

  it('gives build assets a policy that lets nothing run, on every deployment', () => {
    for (const vercelEnv of ['production', 'preview', undefined]) {
      expect(headerRules(vercelEnv)).toContainEqual(STATIC_ASSETS)
    }
    expect(STATIC_ASSETS).toEqual({
      source: '/_next/static/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'" },
      ],
    })
  })

  it('puts the stricter single-route rules last, so they replace the general ones', () => {
    for (const vercelEnv of ['production', 'preview', undefined]) {
      const rules = headerRules(vercelEnv)
      expect(rules.slice(-ROUTE_EXCEPTIONS.length)).toEqual(ROUTE_EXCEPTIONS)
    }
    expect(ROUTE_EXCEPTIONS).toContainEqual({
      source: '/api/owner-setup',
      headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
    })
  })
})

describe('withoutColorSchemeHints', () => {
  it("drops Payload's colour-scheme hints and keeps every other header", () => {
    const rules = withoutColorSchemeHints([
      { source: '/:path*', headers: [{ key: 'X-Frame-Options', value: 'DENY' }] },
      {
        source: '/:path*',
        headers: [
          { key: 'Accept-CH', value: 'Sec-CH-Prefers-Color-Scheme' },
          { key: 'Vary', value: 'Sec-CH-Prefers-Color-Scheme' },
          { key: 'Critical-CH', value: 'Sec-CH-Prefers-Color-Scheme' },
        ],
      },
      { source: '/x', headers: [{ key: 'Vary', value: 'Accept-Encoding' }] },
    ])
    expect(rules).toEqual([
      { source: '/:path*', headers: [{ key: 'X-Frame-Options', value: 'DENY' }] },
      { source: '/x', headers: [{ key: 'Vary', value: 'Accept-Encoding' }] },
    ])
  })
})
