import { PRIVATE_ROUTES } from '@/lib/security/headers'

import { canonicalPath } from './site'

/** The page slug a path shows: "home" for "/", the path without its first slash otherwise. */
export function pageSlugOf(path: string): string {
  const clean = canonicalPath(path)
  return clean === '/' ? 'home' : clean.slice(1)
}

/** A route pattern of next.config.ts ("/book/:path*", "/search") as a regular expression. */
function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .split('/:path*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('(?:/.*)?')
  return new RegExp(`^${escaped}$`)
}

const NOINDEX_PATTERNS = PRIVATE_ROUTES.map(patternToRegExp)

/**
 * Whether a path is one of the routes that are never indexed (src/lib/security/headers.ts,
 * PRIVATE_ROUTES; D-67). The sitemap leaves them out. robots.txt keeps the training crawlers
 * out of them, and every crawler out of /admin and /api; search crawlers may fetch the others
 * and read their noindex (src/lib/seo/robots.ts; D-61).
 */
export function isNoindexPath(path: string): boolean {
  const clean = canonicalPath(path)
  return NOINDEX_PATTERNS.some((pattern) => pattern.test(clean))
}
