// @vitest-environment node
import { buildCustomRoute } from 'next/dist/server/lib/router-utils/filesystem'
import { describe, expect, it } from 'vitest'

import { STARTER_PAGES } from '@/content/starter'
import { pagePath } from '@/lib/content/slug'
import { PRIVATE_ROUTES } from '@/lib/security/headers'
import { APP_PAGES } from '@/lib/seo/appPages'
import { isNoindexPath, pageSlugOf } from '@/lib/seo/paths'

// Which paths are never indexed (src/lib/seo/paths.ts): the sitemap and llms.txt ask this, and
// the answer must be the one the X-Robots-Tag rules give (src/lib/security/headers.ts, D-67).

/** Next.js's own matcher for a header rule's source, as its server builds it. */
const nextMatcher = (source: string) =>
  buildCustomRoute('header', { source, headers: [] }, '', undefined).match

/** For each rule: addresses under it, and addresses that only look like it. */
const CASES: Readonly<
  Record<(typeof PRIVATE_ROUTES)[number], { inside: string[]; near: string[] }>
> = {
  '/admin/:path*': {
    inside: ['/admin', '/admin/login', '/admin/collections/pages/7'],
    near: ['/administration', '/admins'],
  },
  '/api/:path*': { inside: ['/api', '/api/health', '/api/pages/from-starter'], near: ['/apiary'] },
  '/book/:path*': {
    inside: ['/book', '/book/session', '/book/confirmed/fake-ref'],
    near: ['/booking', '/books', '/bookshelf/x'],
  },
  '/b/:path*': { inside: ['/b', '/b/fake-token'], near: ['/blog', '/ba'] },
  '/feedback/:path*': { inside: ['/feedback', '/feedback/fake-token'], near: ['/feedbacks'] },
  '/subscribe/:path*': {
    inside: ['/subscribe', '/subscribe/confirm/fake-token'],
    near: ['/subscribed', '/subscribers'],
  },
  '/account/:path*': {
    inside: ['/account', '/account/bookings', '/account/map'],
    near: ['/accounts', '/accounting'],
  },
  '/search': { inside: ['/search'], near: ['/searching', '/search-tips', '/research'] },
  '/map/go': { inside: ['/map/go'], near: ['/map', '/map/going', '/map/goal'] },
  '/map/result/:path*': {
    inside: ['/map/result', '/map/result/x', '/map/result/x/opengraph-image'],
    near: ['/map', '/map/results', '/map/resulting'],
  },
  '/login/:path*': { inside: ['/login', '/login/verify'], near: ['/logins', '/log'] },
  '/institute/verify/:path*': {
    inside: ['/institute/verify', '/institute/verify/abc'],
    near: ['/institute', '/institute/research', '/institute/verification', '/verify'],
  },
}

describe('pageSlugOf', () => {
  it('is "home" for the first page and the path without its slash for any other', () => {
    expect(pageSlugOf('/')).toBe('home')
    expect(pageSlugOf('')).toBe('home')
    expect(pageSlugOf('/about')).toBe('about')
    expect(pageSlugOf('/About/?x=1#y')).toBe('about')
    expect(pageSlugOf('/organisations/team-map')).toBe('organisations/team-map')
    // The other way round from pagePath, for every page there is.
    for (const slug of Object.keys(STARTER_PAGES)) expect(pageSlugOf(pagePath(slug))).toBe(slug)
  })
})

describe('isNoindexPath', () => {
  it('has a case for every rule, so that a new rule is tested when it is added', () => {
    expect(Object.keys(CASES).sort()).toEqual([...PRIVATE_ROUTES].sort())
  })

  it.each(Object.entries(CASES))('knows what %s covers, and what it does not', (rule, cases) => {
    for (const path of cases.inside) expect(isNoindexPath(path), path).toBe(true)
    for (const path of cases.near) expect(isNoindexPath(path), path).toBe(false)
  })

  it('reads an address as the header rules do: any case, a trailing slash, a query', () => {
    for (const path of [
      '/Map/Go',
      '/map/go/',
      '/map/go?who=yourself',
      '/ADMIN',
      '/Book/Session/',
    ]) {
      expect(isNoindexPath(path), path).toBe(true)
    }
    for (const path of ['/Map', '/map/', '/map?who=yourself', '/Institute/']) {
      expect(isNoindexPath(path), path).toBe(false)
    }
  })

  it('leaves every public page indexable', () => {
    const publicPaths = [
      ...Object.keys(STARTER_PAGES).map(pagePath),
      ...APP_PAGES.map(({ path }) => path),
      '/organisations/team-map',
      '/journal',
      '/proof',
    ]
    for (const path of publicPaths) expect(isNoindexPath(path), path).toBe(false)
  })

  it.each(Object.entries(CASES))(
    'agrees with Next.js’s own matcher for the header rule %s',
    (rule, cases) => {
      const matches = nextMatcher(rule)
      for (const path of cases.inside) expect(Boolean(matches(path)), path).toBe(true)
      for (const path of cases.near) {
        // Another rule may cover a near miss ("/map/go" is near "/map/result"); this one does not.
        expect(Boolean(matches(path)), path).toBe(false)
      }
      const every = PRIVATE_ROUTES.map(nextMatcher)
      for (const path of [...cases.inside, ...cases.near]) {
        expect(isNoindexPath(path), path).toBe(every.some((match) => Boolean(match(path))))
      }
    },
  )
})
