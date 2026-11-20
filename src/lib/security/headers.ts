/**
 * Response headers that do not change per request (docs/12 §5), set for every route by
 * next.config.ts. The Content-Security-Policy needs a nonce per request, so src/proxy.ts sets
 * it instead. This module is read by next.config.ts at build time, so it imports nothing.
 */
export type HeaderRule = { source: string; headers: { key: string; value: string }[] }

export const SECURITY_HEADERS = [
  // At launch: two years with subdomains; `preload` is submitted after a month without
  // incident (docs/12 §5).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // The payment step relaxes payment=() for Razorpay in M3.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // Relaxed to same-origin-allow-popups on the payment step only, if Razorpay needs it (M3).
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // For browsers that predate the CSP's frame-ancestors.
  { key: 'X-Frame-Options', value: 'DENY' },
] as const

const NOINDEX = { key: 'X-Robots-Tag', value: 'noindex' }

/**
 * Routes that are never indexed, on any deployment (docs/12 §3, Canonical and robots). The
 * booking, manage, feedback, confirm, search and account routes arrive in M2, M3 and R2.
 */
export const PRIVATE_ROUTES = [
  '/admin/:path*',
  '/api/:path*',
  '/book/:path*',
  '/b/:path*',
  '/feedback/:path*',
  '/subscribe/:path*',
  '/account/:path*',
  '/search',
] as const

/**
 * The header rules for next.config.ts. Only Vercel's production deployment may be indexed:
 * previews, local builds and CI send noindex on every route (docs/12 §5, Previews).
 */
export function headerRules(vercelEnv: string | undefined): HeaderRule[] {
  const everyRoute: HeaderRule = {
    source: '/:path*',
    headers: [...SECURITY_HEADERS, ...(vercelEnv === 'production' ? [] : [NOINDEX])],
  }
  const privateRoutes: HeaderRule[] =
    vercelEnv === 'production'
      ? PRIVATE_ROUTES.map((source) => ({ source, headers: [NOINDEX] }))
      : []
  return [everyRoute, ...privateRoutes, STATIC_ASSETS, ...ROUTE_EXCEPTIONS]
}

/**
 * Next.js's build assets are outside the proxy, which would otherwise run for every script and
 * style. A file that is missing there still renders the site's 404 page, so these responses get
 * a policy of their own that lets nothing run. Scripts, styles and fonts the pages load ignore
 * a policy on their own response, and the build starts no workers.
 */
export const STATIC_ASSETS: HeaderRule = {
  source: '/_next/static/:path*',
  headers: [
    { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'" },
  ],
}

/**
 * Stricter headers for single routes. They come last, because a later rule replaces an earlier
 * one's header of the same name, and a route handler cannot replace a header these rules set.
 */
export const ROUTE_EXCEPTIONS: HeaderRule[] = [
  // The owner setup link carries the token in its query (D-41): send no referrer at all.
  { source: '/api/owner-setup', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
]

/**
 * Payload adds Accept-CH, Vary and Critical-CH for Sec-CH-Prefers-Color-Scheme to every route
 * so that its admin can follow the system theme. The admin is light only (CLAUDE.md #2), and
 * Critical-CH makes Chrome send a first visit's request twice to include the hint, which costs
 * every new visitor a round trip. These rules drop that header group.
 */
export function withoutColorSchemeHints<Rule extends HeaderRule>(rules: Rule[]): Rule[] {
  const isColorSchemeHint = ({ key, value }: { key: string; value: string }) =>
    ['accept-ch', 'vary', 'critical-ch'].includes(key.toLowerCase()) &&
    value === 'Sec-CH-Prefers-Color-Scheme'
  return rules
    .map((rule) => ({
      ...rule,
      headers: rule.headers.filter((header) => !isColorSchemeHint(header)),
    }))
    .filter((rule) => rule.headers.length > 0)
}
