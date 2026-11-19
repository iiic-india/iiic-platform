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
 * - host routing: a request on an institute host is served from /institute (src/lib/hosts.ts).
 * Headers that never change per request are set in next.config.ts.
 */
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

  const rewrite = instituteRewrite(
    nextUrl.host,
    nextUrl.pathname,
    parseHosts(env().INSTITUTE_HOSTS),
  )
  const response = rewrite
    ? NextResponse.rewrite(new URL(`${rewrite}${nextUrl.search}`, request.url), {
        request: { headers },
      })
    : NextResponse.next({ request: { headers } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    {
      // Pages and the admin. Not the API (its JSON needs no CSP), Next.js's own files or
      // static files; and not prefetches, which carry no page to protect.
      source:
        '/((?!api/|_next/static|_next/image|favicon\\.ico|.*\\.(?:avif|gif|ico|jpe?g|png|svg|txt|webmanifest|webp|woff2?|xml)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
