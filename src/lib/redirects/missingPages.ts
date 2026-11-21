import { isNoindexPath } from '@/lib/seo/paths'

import { requestPath } from './paths'

/**
 * What the 404 page writes to the log (docs/04 `missing_pages`; docs/11 §5.1, item 9), and
 * what it leaves out. The log is for fixing broken links, so it keeps an address and the host of
 * the site that linked to it, never a query string, a page of the referring site or anything
 * about the visitor. Writing must cost the 404 nothing and must not let anyone fill the table:
 * the write happens after the response, at most once per request, at most WRITES_PER_MINUTE
 * times a minute on one server, and no new address is added once the log holds
 * MISSING_PAGES_CAP of them (an address already there still counts its visits).
 */

/** The most addresses the log holds; visits to those already there are still counted. */
export const MISSING_PAGES_CAP = 2000

/** The most writes one server makes to the log in a minute; visits past that are not counted. */
export const WRITES_PER_MINUTE = 120

/** An entry nobody has asked for in this many days is removed (docs/04; job O5). */
export const KEPT_FOR_DAYS = 180

export type MissingPage = { path: string; referrerHost: string | null }

const HOSTNAME =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/

/** The host of the page a visitor came from, as their browser sent it; never its path or query. */
export function referrerHost(referer: string | null | undefined): string | null {
  if (!referer) return null
  try {
    const { protocol, hostname } = new URL(referer)
    if (protocol !== 'https:' && protocol !== 'http:') return null
    const host = hostname.toLowerCase()
    return HOSTNAME.test(host) ? host : null
  } catch {
    return null
  }
}

/** A prefetch, Next.js's own or the browser's: nobody has visited the address yet. */
export function isPrefetch(headers: Headers): boolean {
  if (headers.has('next-router-prefetch') || headers.has('next-router-segment-prefetch')) {
    return true
  }
  return /prefetch/i.test(headers.get('sec-purpose') ?? headers.get('purpose') ?? '')
}

/** Next.js's own error pages, which src/proxy.ts answers with the 404: asked for by probes only. */
const ERROR_PAGES = new Set(['/404', '/500'])
/** Files of software the site does not run, which bots try on every site. */
const PROBE_FILE = /\.(?:php\d?|aspx?|jsp|cgi|env|ini|bak|sql|sh)$/i
/** First parts of such probes: WordPress's folders, CGI, and Next.js's own (`/_next`). */
const PROBE_START = /^(?:wp-|cgi-bin$|_)/i
/** A run of seven or more digits: a phone number, an order or a booking number. */
const DIGITS = /\d{7,}/
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/**
 * Ten or more digits written as a phone number is, with spaces, dots, dashes or brackets
 * between them ("+91 96240 46464", "98242-74345"). A date ("2023-04-03") has eight.
 */
function hasPhoneNumber(path: string): boolean {
  return (path.match(/[+(\d][\d\s().-]*\d/g) ?? []).some(
    (run) => run.replace(/\D/g, '').length >= 10,
  )
}

/**
 * Whether one part of an address looks like a key: twenty or more letters, digits, "-" and "_"
 * with a digit among them, and either a capital letter or no hyphen at all. A page's address is
 * small words joined by hyphens, which never looks like this.
 */
function looksLikeToken(part: string): boolean {
  return (
    /^[A-Za-z0-9_-]{20,}$/.test(part) &&
    /\d/.test(part) &&
    (/[A-Z]/.test(part) || !part.includes('-'))
  )
}

/**
 * Whether an address is left out of the log: a route that is never indexed (src/lib/seo/paths.ts;
 * D-67), which is reached by a token or an id and holds nothing a redirect should fix; a probe
 * for software the site does not run; or an address that may carry something about a person
 * (an email address, a phone number or another long number, something that looks like a key).
 */
export function notLogged(path: string): boolean {
  const parts = path.split('/').filter(Boolean)
  return (
    isNoindexPath(path) ||
    ERROR_PAGES.has(path) ||
    PROBE_START.test(parts[0] ?? '') ||
    parts.some((part) => part.startsWith('.')) ||
    PROBE_FILE.test(path) ||
    path.includes('@') ||
    DIGITS.test(path) ||
    hasPhoneNumber(path) ||
    UUID.test(path) ||
    parts.some(looksLikeToken)
  )
}

/**
 * The entry a 404 response adds to the log, or null when it adds none. The path is the one
 * src/proxy.ts puts on the request, decoded and cleaned (src/lib/redirects/paths.ts).
 */
export function missingPageOf(headers: Headers): MissingPage | null {
  if (isPrefetch(headers)) return null
  const path = requestPath(headers.get('x-pathname'))
  if (!path || notLogged(path)) return null
  return { path, referrerHost: referrerHost(headers.get('referer')) }
}

/** A count of writes per minute on one server (fixed windows; the clock is given for tests). */
export class WriteBudget {
  private windowStart = Number.NEGATIVE_INFINITY
  private used = 0

  constructor(
    private readonly perMinute: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Whether one more write fits in this minute; counts it if it does. */
  take(): boolean {
    const now = this.now()
    if (now - this.windowStart >= 60_000) {
      this.windowStart = now
      this.used = 0
    }
    if (this.used >= this.perMinute) return false
    this.used += 1
    return true
  }
}
