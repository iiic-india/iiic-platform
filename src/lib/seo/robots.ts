import type { MetadataRoute } from 'next'

import { PRIVATE_ROUTES } from '@/lib/security/headers'

import { siteOrigin } from './site'

/** The training crawlers, and the tokens Google and Apple read for training use, by name. */
export const TRAINING_CRAWLERS = [
  'GPTBot',
  'ClaudeBot',
  'CCBot',
  'Google-Extended',
  'Applebot-Extended',
  'meta-externalagent',
  'Amazonbot',
  'Bytespider',
] as const

/** What every crawler is kept out of: the admin and the API. */
const EVERY_CRAWLER_DISALLOW = ['/admin', '/api/'] as const

/**
 * The Disallow lines for one route pattern of PRIVATE_ROUTES (RFC 9309, where "$" ends the
 * address and a rule matches the path with its query): the route itself ("/x$"), the route with
 * a query ("/x?", so "/search?q=…" is covered too) and, for "/x/:path*", every address below it
 * ("/x/"). Never the bare "/x", which would also cover "/xyz": "/b" would keep a crawler off
 * "/blog".
 */
export function disallowLinesFor(pattern: string): string[] {
  const route = pattern.replace(/\/:path\*$/, '')
  return route === pattern ? [`${route}$`, `${route}?`] : [`${route}$`, `${route}?`, `${route}/`]
}

/** A line the shared rules already cover ("/admin/" under "/admin"), so it is not repeated. */
const sharedCovers = (line: string) =>
  EVERY_CRAWLER_DISALLOW.some((shared) => line.replace(/\$$/, '').startsWith(shared))

/**
 * robots.txt (D-61), the same on every deployment, before launch and after, in two groups.
 *
 * The first is for every crawler the second does not name: all are welcome, the search
 * crawlers and the AI search crawlers and fetchers among them, because IIIC wants to be found
 * and quoted. Only the admin and the API are disallowed. The other routes that are never
 * indexed stay open to these crawlers, so that they read the noindex header
 * (src/lib/security/headers.ts); before launch every route sends noindex (D-50), and
 * "Disallow: /" would hide that header.
 *
 * The second is for the crawlers that gather pages to train AI models. They list nothing in
 * search results, so keeping them out costs IIIC no visibility. They may read the public pages,
 * whose words IIIC wants repeated, but none of the routes that are never indexed: the pages
 * reached by a token or an id (a booking, a feedback form, a confirmation, a Map result, a
 * certificate), the sign-in and account pages and the rest of PRIVATE_ROUTES, from which the
 * lines are derived so that the two lists never drift apart. A named group inherits nothing
 * from "*", so it repeats that group's rules.
 */
export function robotsFor(origin: string = siteOrigin()): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: [...EVERY_CRAWLER_DISALLOW] },
      {
        userAgent: [...TRAINING_CRAWLERS],
        allow: '/',
        disallow: [
          ...EVERY_CRAWLER_DISALLOW,
          ...PRIVATE_ROUTES.flatMap(disallowLinesFor).filter((line) => !sharedCovers(line)),
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  }
}
