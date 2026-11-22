import { draftMode } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

import { safeBack } from '@/lib/auth/safeBack'

// docs/12 §6: every route handler declares its runtime and its time limit.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 10

/**
 * Leaving preview (docs/15 §5.3, OS-4): turns Next.js's draft mode off for this browser, which
 * removes its cookie, and opens the published page at `?path=`, a path on this site (anything
 * else opens the home page). Anyone may leave: it only ever removes the browser's own cookie.
 */
export async function GET(request: NextRequest): Promise<Response> {
  ;(await draftMode()).disable()
  const path = safeBack(request.nextUrl.searchParams.get('path'), '/')
  const response = NextResponse.redirect(new URL(path, request.url), 303)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('X-Robots-Tag', 'noindex')
  return response
}
