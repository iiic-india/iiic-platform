import { NextResponse, type NextRequest } from 'next/server'

import { beaconSources } from '@/lib/analytics/beacon'
import { env } from '@/lib/env'
import { instituteRewrite, parseHosts } from '@/lib/hosts'
import { framedByAdmin } from '@/lib/preview/frame'
import { checkoutSources } from '@/lib/security/checkout'
import { buildCsp, createNonce } from '@/lib/security/csp'

/**
 * Runs before every page and admin view (docs/12 §1 and §5, D-42):
 * - a Content-Security-Policy with a fresh nonce, on the response and on the request, where
 *   Next.js reads it to put the nonce on its scripts while the page renders;
 * - framing: `frame-ancestors 'none'` and `X-Frame-Options: DENY`, except on a draft-mode
 *   response to staff signed in with their two-factor code, which the admin's live preview
 *   frames on the same origin (`'self'`, `SAMEORIGIN`, and noindex; src/lib/preview/frame.ts,
 *   OS-4). The admin itself may frame this origin and nothing else. The header is set here,
 *   not in next.config.ts, which sends it only where the proxy does not run;
 * - Cloudflare's beacon origins, on public pages only and only where its token is set
 *   (src/lib/analytics/beacon.ts);
 * - `x-pathname` on the request, set here so that no client can supply its own; the TOTP
 *   views in the admin read it (M1, staff two-factor);
 * - host routing: a request on an institute host is served from /institute (src/lib/hosts.ts);
 * - Next.js's own prerendered error pages, whose scripts carry no nonce, are never served
 *   directly: a request for one, or for a page Next.js keeps to itself (`/_app`, `/_document`,
 *   `/_error`), gets the site's 404, rendered with the nonce.
 * Headers that never change per request are set in next.config.ts.
 */
const PRERENDERED_ERROR_PAGES = new Set([
  '/_not-found',
  '/_global-error',
  '/404',
  '/500',
  '/_app',
  '/_document',
  '/_error',
])

/** Whether Next.js would answer this path with its own prerendered 404. */
function servesNextErrorPage(pathname: string): boolean {
  const path = decodedPath(pathname)
  return PRERENDERED_ERROR_PAGES.has(path)
}

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

/** The admin's pages: the only ones that may frame this origin (the live preview). */
const isAdminPath = (pathname: string) => /^\/admin(?:\/|$)/i.test(decodedPath(pathname))

export async function proxy(request: NextRequest) {
  const { nextUrl } = request
  const admin = isAdminPath(nextUrl.pathname)
  const framed = !admin && (await framedByAdmin(request.cookies, env().PAYLOAD_SECRET))
  const beacon = beaconSources(nextUrl.pathname)
  // Razorpay's checkout, on the payment step only (src/lib/security/checkout.ts).
  const checkout = checkoutSources(nextUrl.pathname, env().PAYMENT_GATEWAY)
  const csp = buildCsp({
    nonce: createNonce(),
    development: process.env.NODE_ENV === 'development',
    https: nextUrl.protocol === 'https:',
    imageOrigins: [
      ...(env().mediaOrigin ? [env().mediaOrigin as string] : []),
      ...checkout.imageOrigins,
    ],
    scriptOrigins: [...beacon.scriptOrigins, ...checkout.scriptOrigins],
    connectOrigins: [...beacon.connectOrigins, ...checkout.connectOrigins],
    frameAncestors: framed ? "'self'" : "'none'",
    frameSources: admin ? "'self'" : "'none'",
    frameOrigins: checkout.frameOrigins,
  })
  const headers = new Headers(request.headers)
  headers.set('Content-Security-Policy', csp)
  headers.set('x-pathname', nextUrl.pathname)

  const rewrite = servesNextErrorPage(nextUrl.pathname)
    ? NOT_FOUND_PATH
    : instituteRewrite(nextUrl.host, nextUrl.pathname, parseHosts(env().INSTITUTE_HOSTS))
  const response = rewrite
    ? NextResponse.rewrite(new URL(`${rewrite}${nextUrl.search}`, request.url), {
        request: { headers },
      })
    : NextResponse.next({ request: { headers } })
  response.headers.set('Content-Security-Policy', csp)
  // For browsers that predate the CSP's frame-ancestors.
  response.headers.set('X-Frame-Options', framed ? 'SAMEORIGIN' : 'DENY')
  // A draft is never indexed, wherever its address points.
  if (framed) response.headers.set('X-Robots-Tag', 'noindex')
  return response
}

export const config = {
  // Every path but the API (its JSON needs no CSP) and Next.js's own build assets. Nothing is
  // skipped on a request header: a client could add one to an ordinary page request. There is
  // no public/ folder, so a path that looks like a file still renders a page here.
  matcher: ['/((?!api/|_next/static/|_next/image).*)'],
}
