// @vitest-environment node
import { buildCustomRoute } from 'next/dist/server/lib/router-utils/filesystem'
import { describe, expect, it } from 'vitest'

import {
  CONTENT_LANGUAGE,
  type HeaderRule,
  headerRules,
  PRIVATE_ROUTES,
  ROUTE_EXCEPTIONS,
  SECURITY_HEADERS,
  STATIC_ASSETS,
  withoutColorSchemeHints,
} from '@/lib/security/headers'

const keys = (headers: { key: string }[]) => headers.map((header) => header.key)

/** Next.js's own matcher for a header rule's source, as its server builds it. */
const matcherOf = (source: string) =>
  buildCustomRoute('header', { source, headers: [] }, '', undefined).match

/**
 * The headers a path is sent: those of every rule whose source Next.js matches to it, a later
 * rule replacing an earlier one's header of the same name.
 */
function headersFor(path: string, rules: HeaderRule[]): Record<string, string> {
  const sent = new Map<string, string>()
  for (const rule of rules) {
    if (!matcherOf(rule.source)(path)) continue
    for (const { key, value } of rule.headers) sent.set(key, value)
  }
  return Object.fromEntries(sent)
}

/** Every deployment there is: Vercel's environment, and the launch switch (D-50). */
const DEPLOYMENTS = [
  ['production', 'on'],
  ['production', undefined],
  ['preview', undefined],
  ['preview', 'on'],
  [undefined, undefined],
] as const

describe('headerRules', () => {
  it('sends the security headers on every route', () => {
    for (const vercelEnv of ['production', 'preview', undefined]) {
      const [everyRoute] = headerRules(vercelEnv)
      expect(everyRoute?.source).toBe('/:path*')
      expect(everyRoute?.headers).toEqual(expect.arrayContaining([...SECURITY_HEADERS]))
    }
  })

  it('keeps every deployment but production out of search engines, whatever the switch says', () => {
    for (const vercelEnv of ['preview', 'development', undefined]) {
      for (const searchIndexing of [undefined, 'on']) {
        const rules = headerRules(vercelEnv, searchIndexing)
        expect(keys(rules[0]?.headers ?? [])).toContain('X-Robots-Tag')
      }
    }
  })

  it('keeps production out of search engines until the site has launched (D-50)', () => {
    for (const searchIndexing of [undefined, '', 'off', 'true', 'ON']) {
      const rules = headerRules('production', searchIndexing)
      expect(rules[0]?.headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex' })
    }
  })

  it('lets the launched production site be indexed, except its private routes', () => {
    const [everyRoute, ...rest] = headerRules('production', 'on')
    const privateRoutes = rest.slice(0, PRIVATE_ROUTES.length)
    expect(keys(everyRoute?.headers ?? [])).not.toContain('X-Robots-Tag')
    expect(privateRoutes.map((rule) => rule.source)).toEqual([...PRIVATE_ROUTES])
    for (const rule of privateRoutes) {
      expect(rule.headers).toEqual([{ key: 'X-Robots-Tag', value: 'noindex' }])
    }
  })

  it('never indexes the four routes the search system added (D-67)', () => {
    for (const route of [
      '/map/go',
      '/map/result/:path*',
      '/login/:path*',
      '/institute/verify/:path*',
    ]) {
      expect(PRIVATE_ROUTES, route).toContain(route)
    }
    const launched = headerRules('production', 'on')
    // Where Find your path posts its answer, the Map's personal result and its share image,
    // the sign-in pages, and a certificate's page.
    for (const path of [
      '/map/go',
      '/map/result',
      '/map/result/fake-id',
      '/map/result/fake-id/opengraph-image',
      '/login',
      '/login/verify',
      '/institute/verify',
      '/institute/verify/fake-token',
    ]) {
      expect(headersFor(path, launched)['X-Robots-Tag'], path).toBe('noindex')
    }
    // The pages beside them stay in search.
    for (const path of ['/map', '/institute', '/institute/research', '/learn', '/']) {
      expect(headersFor(path, launched)['X-Robots-Tag'], path).toBeUndefined()
    }
  })

  it('keeps every route out of search until launch, the new ones included (D-50)', () => {
    for (const [vercelEnv, searchIndexing] of DEPLOYMENTS) {
      if (vercelEnv === 'production' && searchIndexing === 'on') continue
      const rules = headerRules(vercelEnv, searchIndexing)
      for (const path of [
        '/',
        '/about',
        '/map',
        '/map/go',
        '/llms.txt',
        '/robots.txt',
        '/sitemap.xml',
      ]) {
        expect(headersFor(path, rules)['X-Robots-Tag'], `${vercelEnv} ${path}`).toBe('noindex')
      }
    }
  })

  it('says the language of every page on every deployment, launched or not', () => {
    expect(CONTENT_LANGUAGE.headers).toEqual([{ key: 'Content-Language', value: 'en-IN' }])
    for (const [vercelEnv, searchIndexing] of DEPLOYMENTS) {
      const rules = headerRules(vercelEnv, searchIndexing)
      expect(rules, `${vercelEnv} ${searchIndexing}`).toContainEqual(CONTENT_LANGUAGE)
      expect(rules.filter((rule) => keys(rule.headers).includes('Content-Language'))).toHaveLength(
        1,
      )
    }
  })

  it('sends Content-Language on pages, images and text files, and not on the API or build assets', () => {
    const matches = matcherOf(CONTENT_LANGUAGE.source)
    for (const path of [
      '/',
      '/about',
      '/organisations/team-map',
      '/og/home',
      '/og/organisations/team-map',
      '/llms.txt',
      '/robots.txt',
      '/sitemap.xml',
      '/admin/login',
      '/no-such-page',
    ]) {
      expect(Boolean(matches(path)), path).toBe(true)
    }
    for (const path of [
      '/api/health',
      '/api/owner-setup',
      '/API/health',
      '/_next/static/x.js',
      '/_next/static/chunks/a.js',
      '/_next/image',
    ]) {
      expect(Boolean(matches(path)), path).toBe(false)
    }
    // As a response gets it, with the other rules around it.
    for (const [vercelEnv, searchIndexing] of DEPLOYMENTS) {
      const rules = headerRules(vercelEnv, searchIndexing)
      expect(headersFor('/about', rules)['Content-Language']).toBe('en-IN')
      expect(headersFor('/llms.txt', rules)['Content-Language']).toBe('en-IN')
      expect(headersFor('/api/health', rules)['Content-Language']).toBeUndefined()
      expect(headersFor('/_next/static/x.js', rules)['Content-Language']).toBeUndefined()
    }
  })

  it('has only sources Next.js can compile', () => {
    for (const [vercelEnv, searchIndexing] of DEPLOYMENTS) {
      for (const rule of headerRules(vercelEnv, searchIndexing)) {
        expect(() => matcherOf(rule.source), rule.source).not.toThrow()
      }
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
