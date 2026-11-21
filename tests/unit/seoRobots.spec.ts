// @vitest-environment node
import type { MetadataRoute } from 'next'
import { resolveRobots } from 'next/dist/build/webpack/loaders/metadata/resolve-route-data'
import { afterEach, describe, expect, it, vi } from 'vitest'

import robots from '@/app/robots'
import { STARTER_PAGES } from '@/content/starter'
import { pagePath } from '@/lib/content/slug'
import { PRIVATE_ROUTES } from '@/lib/security/headers'
import { AI_CRAWLERS, SEARCH_CRAWLERS } from '@/lib/seo/bots'
import { isNoindexPath } from '@/lib/seo/paths'
import { disallowLinesFor, robotsFor, TRAINING_CRAWLERS } from '@/lib/seo/robots'

// robots.txt (src/lib/seo/robots.ts; D-61): the same on every deployment. Every crawler is
// welcome and kept out of only the admin and the API; the training crawlers are also kept out
// of every route that is never indexed (src/lib/security/headers.ts, PRIVATE_ROUTES).

afterEach(() => {
  vi.unstubAllEnvs()
})

type Group = Exclude<MetadataRoute.Robots['rules'], unknown[]>

const ORIGIN = 'https://fake.example'

/** The training group's Disallow lines, written out: the admin and the API, then PRIVATE_ROUTES. */
const TRAINING_DISALLOW = [
  '/admin',
  '/api/',
  '/api$',
  '/api?',
  '/book$',
  '/book?',
  '/book/',
  '/b$',
  '/b?',
  '/b/',
  '/feedback$',
  '/feedback?',
  '/feedback/',
  '/subscribe$',
  '/subscribe?',
  '/subscribe/',
  '/account$',
  '/account?',
  '/account/',
  '/search$',
  '/search?',
  '/map/go$',
  '/map/go?',
  '/map/result$',
  '/map/result?',
  '/map/result/',
  '/login$',
  '/login?',
  '/login/',
  '/institute/verify$',
  '/institute/verify?',
  '/institute/verify/',
]

/** The groups of a robots.txt, the one for every crawler first. */
function groupsOf(file: MetadataRoute.Robots): { everyone: Group; training: Group } {
  const rules = Array.isArray(file.rules) ? file.rules : [file.rules]
  expect(rules).toHaveLength(2)
  const [everyone, training] = rules
  if (!everyone || !training) throw new Error('robots.txt has fewer than two groups')
  return { everyone, training }
}

const listOf = (value: string | string[] | undefined) => [value ?? []].flat()

/** Whether a line matches a path as RFC 9309 reads it: "*" is any run of characters, "$" the end. */
function matches(line: string, path: string): boolean {
  const end = line.endsWith('$')
  const body = (end ? line.slice(0, -1) : line)
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${body}${end ? '$' : ''}`).test(path)
}

/**
 * Whether a group lets its crawlers fetch a path (RFC 9309 §2.2.2): the longest line that
 * matches decides, and Allow wins a tie. A path no line matches may be fetched.
 */
function allowed(group: Group, path: string): boolean {
  const longest = (lines: string[]) =>
    Math.max(-1, ...lines.filter((line) => matches(line, path)).map((line) => line.length))
  return longest(listOf(group.allow)) >= longest(listOf(group.disallow))
}

/** Public addresses, and addresses that only begin like a private route's. */
const PUBLIC_PATHS = [
  ...Object.keys(STARTER_PAGES).map(pagePath),
  '/map',
  '/institute',
  '/blog',
  '/booking',
  '/books',
  '/mapping',
  '/map/goal',
  '/map/results',
  '/institute/verifying',
  '/searching',
  '/logins',
  '/accounts',
  '/feedbacks',
  '/subscribers',
  '/apis',
  '/llms.txt',
  '/humans.txt',
  '/sitemap.xml',
  '/og/home',
]

/** Each route that is never indexed, and addresses below the ones that have them. */
const PRIVATE_PATHS = PRIVATE_ROUTES.flatMap((pattern) => {
  const route = pattern.replace('/:path*', '')
  const withQuery = `${route}?fake=1`
  return route === pattern
    ? [route, withQuery]
    : [route, withQuery, `${route}/`, `${route}/fake`, `${route}/fake/deeper`]
})

describe('robots.txt', () => {
  it('is exactly D-61: two groups, the second for the training crawlers, and the sitemap', () => {
    expect(robotsFor(ORIGIN)).toEqual({
      rules: [
        { userAgent: '*', allow: '/', disallow: ['/admin', '/api/'] },
        { userAgent: [...TRAINING_CRAWLERS], allow: '/', disallow: TRAINING_DISALLOW },
      ],
      sitemap: `${ORIGIN}/sitemap.xml`,
    })
    expect([...TRAINING_CRAWLERS]).toEqual([
      'GPTBot',
      'ClaudeBot',
      'CCBot',
      'Google-Extended',
      'Applebot-Extended',
      'meta-externalagent',
      'Amazonbot',
      'Bytespider',
    ])
  })

  it('reads, as Next.js writes it, line for line', () => {
    // Next.js's own writer for app/robots.ts.
    expect(resolveRobots(robotsFor(ORIGIN))).toBe(
      [
        'User-Agent: *',
        'Allow: /',
        'Disallow: /admin',
        'Disallow: /api/',
        '',
        ...TRAINING_CRAWLERS.map((crawler) => `User-Agent: ${crawler}`),
        'Allow: /',
        ...TRAINING_DISALLOW.map((line) => `Disallow: ${line}`),
        '',
        `Sitemap: ${ORIGIN}/sitemap.xml`,
        '',
      ].join('\n'),
    )
  })

  it('names only the training crawlers: every other crawler follows the rules under "*"', () => {
    const text = resolveRobots(robotsFor(ORIGIN))
    const named = [...text.matchAll(/^User-Agent: (.+)$/gm)].map((match) => match[1])
    expect(named).toEqual(['*', ...TRAINING_CRAWLERS])
    const training = new Set<string>(TRAINING_CRAWLERS)
    for (const crawler of [...SEARCH_CRAWLERS, ...AI_CRAWLERS, 'Bingbot', 'Applebot']) {
      if (training.has(crawler)) continue
      expect(named, crawler).not.toContain(crawler)
    }
    // Nothing slows or limits a crawler either.
    expect(text).not.toMatch(/crawl-delay|noindex|host:/i)
  })

  it('keeps every crawler out of the admin and the API only, so that the other noindex headers are read', () => {
    const { everyone } = groupsOf(robotsFor(ORIGIN))
    expect(everyone).toEqual({ userAgent: '*', allow: '/', disallow: ['/admin', '/api/'] })
    for (const route of PRIVATE_ROUTES) {
      const path = route.replace('/:path*', '')
      const kept = ['/admin', '/api'].includes(path)
      // An address below the route: only the admin's and the API's are kept out.
      expect(allowed(everyone, `${path}/fake`), route).toBe(!kept)
      if (!kept) expect(allowed(everyone, path), route).toBe(true)
    }
  })

  it('keeps the training crawlers out of every route that is never indexed, and below it', () => {
    const { training } = groupsOf(robotsFor(ORIGIN))
    for (const path of PRIVATE_PATHS) {
      expect(isNoindexPath(path), path).toBe(true)
      expect(allowed(training, path), path).toBe(false)
    }
  })

  it('keeps the training crawlers out of exactly the addresses the noindex header covers', () => {
    // The two lists cannot drift apart: the lines are derived from PRIVATE_ROUTES.
    const { training } = groupsOf(robotsFor(ORIGIN))
    for (const path of [...PRIVATE_PATHS, ...PUBLIC_PATHS]) {
      expect(allowed(training, path), path).toBe(!isNoindexPath(path))
    }
  })

  it('repeats the rules under "*" in the training group, which inherits nothing from it', () => {
    const { everyone, training } = groupsOf(robotsFor(ORIGIN))
    expect(training.allow).toEqual(everyone.allow)
    const shared = listOf(everyone.disallow)
    expect(listOf(training.disallow).slice(0, shared.length)).toEqual(shared)
    for (const path of ['/admin', '/admin/fake', '/api/fake']) {
      expect(allowed(everyone, path), path).toBe(false)
      expect(allowed(training, path), path).toBe(false)
    }
  })

  it('disallows no public page, for any crawler, and no address that only begins like a private one', () => {
    const { everyone, training } = groupsOf(robotsFor(ORIGIN))
    for (const path of PUBLIC_PATHS) {
      expect(allowed(everyone, path), path).toBe(true)
      expect(allowed(training, path), path).toBe(true)
    }
  })

  it('writes a route and what is below it, never a bare prefix that would cover another address', () => {
    expect(disallowLinesFor('/b/:path*')).toEqual(['/b$', '/b?', '/b/'])
    expect(disallowLinesFor('/search')).toEqual(['/search$', '/search?'])
    expect(disallowLinesFor('/map/result/:path*')).toEqual([
      '/map/result$',
      '/map/result?',
      '/map/result/',
    ])
    const { training } = groupsOf(robotsFor(ORIGIN))
    for (const line of listOf(training.disallow).slice(2)) {
      expect(line, line).toMatch(/[$/?]$/)
    }
  })

  it('points at the sitemap on the platform domain unless the deployment names its own origin', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    expect(robotsFor().sitemap).toBe('https://imagecatalysts.in/sitemap.xml')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000')
    expect(robotsFor().sitemap).toBe('http://localhost:3000/sitemap.xml')
  })
})

describe('the route /robots.txt', () => {
  it('serves that file, before launch and after', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    // Nothing about the deployment changes it: not Vercel's environment, not the launch switch.
    for (const [vercelEnv, searchIndexing] of [
      ['preview', ''],
      ['production', ''],
      ['production', 'on'],
    ] as const) {
      vi.stubEnv('VERCEL_ENV', vercelEnv)
      vi.stubEnv('SEARCH_INDEXING', searchIndexing)
      expect(robots(), `${vercelEnv} ${searchIndexing}`).toEqual(
        robotsFor('https://imagecatalysts.in'),
      )
    }
  })
})
