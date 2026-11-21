/**
 * Addresses as the 404 log and the redirects hold them (docs/04 `redirects`, `missing_pages`):
 * a path on this site, decoded, with no query string, no fragment and no trailing slash. A
 * request's path is cleaned the same way before it is logged and before it is looked up, so an
 * entry in the log becomes a redirect that matches the very requests that were logged. Case is
 * kept: Next.js matches routes by case, so /About and /about are two addresses.
 */

/** The longest address kept: longer ones are never a page anyone linked to on purpose. */
export const MAX_PATH_LENGTH = 200

/**
 * The most redirects the site reads to answer an address (docs/12 §4: no query without a
 * limit). A site of this size has tens; the admin refuses one more past this many, so none is
 * ever left unread.
 */
export const MAX_REDIRECTS = 2000

/** Control characters, and the characters that end a path or are not part of one. */
const NOT_IN_A_PATH = /[\u0000-\u001f\u007f?#\\]/

/**
 * A decoded path as the log and the redirects keep it: one slash in front, none at the end
 * (Next.js redirects a trailing slash away before a page sees it), at most MAX_PATH_LENGTH
 * characters, and no empty part. Null for anything else.
 */
export function cleanPath(decoded: string): string | null {
  if (!decoded.startsWith('/')) return null
  const path = decoded.replace(/\/+$/, '') || '/'
  if (path.length > MAX_PATH_LENGTH || NOT_IN_A_PATH.test(path) || path.includes('//')) return null
  return path
}

/** A request's path as the proxy saw it (percent-encoded), decoded and cleaned; null if malformed. */
export function requestPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null
  try {
    return cleanPath(decodeURIComponent(pathname))
  } catch {
    return null
  }
}

/** The path a catch-all route was asked for, from its segments, which Next.js has decoded. */
export function pathOf(...segments: string[]): string | null {
  return cleanPath(`/${segments.join('/')}`)
}

/**
 * Where a redirect may send a visitor when it names an address rather than a page: a page's
 * address on this site ("/", "/about", "/organisations/team-map"), in the small letters, digits
 * and hyphens of a page's address, optionally with a section's link name ("/about#contact").
 * Never another site: a redirect that could point anywhere would let the site be used to send
 * people elsewhere.
 */
const SITE_PATH =
  /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?(?:#[a-z0-9]+(?:-[a-z0-9]+)*)?$/

export function isSitePath(value: unknown): value is string {
  return typeof value === 'string' && SITE_PATH.test(value)
}

/** An address without the section it opens: "/about#contact" is "/about". */
export function withoutSection(path: string): string {
  return path.split('#')[0] || '/'
}

/** The section part of an address, with its "#", or nothing. */
export function sectionOf(path: string): string {
  const index = path.indexOf('#')
  return index === -1 ? '' : path.slice(index)
}

/**
 * Addresses the site answers itself, whatever the redirects say: the admin and the API, the
 * build's files, the generated files beside the pages, Next.js's own error pages (which
 * src/proxy.ts answers with the 404), the 404's own address and Find your path. A redirect from
 * one of them would never be followed, so none may be made.
 */
const ANSWERED_BY_THE_SITE = [
  '/admin',
  '/api',
  '/.well-known',
  '/og',
  '/map',
  '/page-not-found',
  '/404',
  '/500',
  '/robots.txt',
  '/sitemap.xml',
  '/llms.txt',
  '/humans.txt',
  '/manifest.webmanifest',
  '/logo.png',
  '/favicon.ico',
  '/icon.svg',
]

export function answeredBySite(path: string): boolean {
  return (
    path === '/' ||
    // Next.js's own: /_next, and the pages it keeps to itself (/_not-found, /_error, …).
    path.startsWith('/_') ||
    ANSWERED_BY_THE_SITE.some((route) => path === route || path.startsWith(`${route}/`))
  )
}

/**
 * The two kinds of redirect a page can send: Next.js answers from a page with 308 for a
 * permanent move and 307 for a temporary one (search engines read 308 as they read 301).
 */
export const REDIRECT_STATUSES = [
  { label: 'Permanent (308): the page has moved for good', value: '308' },
  { label: 'Temporary (307): the page will come back', value: '307' },
] as const

export type RedirectStatus = (typeof REDIRECT_STATUSES)[number]['value']
