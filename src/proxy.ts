import { NextResponse, type NextRequest } from 'next/server'

import { env } from '@/lib/env'
import { instituteRewrite, parseHosts } from '@/lib/hosts'
import { buildCsp, createNonce } from '@/lib/security/csp'

/**
 * Runs before every page and admin view (docs/12 §1 and §5, D-42):
 * - a Content-Security-Policy with a fresh nonce, on the response and on the request, where
 *   Next.js reads it to put the nonce on its scripts while the page renders;
 * - `x-pathname` on the request, set here so that no client can supply its own; the TOTP
 *   views in the admin read it (M1, staff two-factor);
 * - host routing: a request on an institute host is served from /institute (src/lib/hosts.ts);
 * - Next.js's own prerendered error pages, whose scripts carry no nonce, are never served
 *   directly: a request for one gets the site's 404, rendered with the nonce.
 * Headers that never change per request are set in next.config.ts.
 */
const PRERENDERED_ERROR_PAGES = new Set(['/_not-found', '/_global-error', '/404', '/500'])

/** The path as Next.js's own file lookup sees it, so an encoded `/%5Fnot-found` is caught too. */
function decodedPath(pathname: string): string {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return pathname
  }
}
// A path no route claims, which the catch-all renders as the site's 404 (Next.js maps /404 to
// its own prerendered page, so that path cannot be used).
const NOT_FOUND_PATH = '/page-not-found'

export function proxy(request: NextRequest) {
  const { nextUrl } = request
  const csp = buildCsp({
    nonce: createNonce(),
    development: process.env.NODE_ENV === 'development',
    https: nextUrl.protocol === 'https:',
  })
  const headers = new Headers(request.headers)
  headers.set('Content-Security-Policy', csp)
  headers.set('x-pathname', nextUrl.pathname)

  const rewrite = PRERENDERED_ERROR_PAGES.has(decodedPath(nextUrl.pathname))
    ? NOT_FOUND_PATH
    : instituteRewrite(nextUrl.host, nextUrl.pathname, parseHosts(env().INSTITUTE_HOSTS))
  const response = rewrite
    ? NextResponse.rewrite(new URL(`${rewrite}${nextUrl.search}`, request.url), {
        request: { headers },
      })
    : NextResponse.next({ request: { headers } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  // Every path but the API (its JSON needs no CSP) and Next.js's own build assets. Nothing is
  // skipped on a request header: a client could add one to an ordinary page request. There is
  // no public/ folder, so a path that looks like a file still renders a page here.
  matcher: ['/((?!api/|_next/static/|_next/image).*)'],
}
