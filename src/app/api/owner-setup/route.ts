import { NextResponse, type NextRequest } from 'next/server'

import { env } from '@/lib/env'
import {
  OWNER_SETUP_COOKIE,
  OWNER_SETUP_COOKIE_PATH,
  OWNER_SETUP_MAX_AGE_SECONDS,
  tokenMatches,
} from '@/lib/ownerSetup'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 10

const PRIVATE_HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
}

/**
 * The owner setup link (D-41). A token that matches OWNER_SETUP_TOKEN sets a
 * ten-minute cookie that only Payload's first-user registration receives, then opens
 * /admin/create-first-user. Anything else gets the same plain 404, whether the token is
 * unset or wrong.
 */
export function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token || !tokenMatches(env().OWNER_SETUP_TOKEN, token)) {
    return new NextResponse('Not found', { status: 404, headers: PRIVATE_HEADERS })
  }
  const response = NextResponse.redirect(new URL('/admin/create-first-user', request.url), 303)
  response.cookies.set(OWNER_SETUP_COOKIE, token, {
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
    sameSite: 'strict',
    path: OWNER_SETUP_COOKIE_PATH,
    maxAge: OWNER_SETUP_MAX_AGE_SECONDS,
  })
  for (const [name, value] of Object.entries(PRIVATE_HEADERS)) response.headers.set(name, value)
  return response
}
