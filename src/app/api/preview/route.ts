import { draftMode } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { getPayload } from 'payload'

import { canPreview, previewPath, previewRequest } from '@/lib/preview/access'
import config from '@payload-config'

// docs/12 §6: every route handler declares its runtime and its time limit.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 10

const PRIVATE_HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }

/** The same plain 404 for every request that may not preview, whatever it lacked. */
const notFound = () => new NextResponse('Not found', { status: 404, headers: PRIVATE_HEADERS })

/**
 * The admin's preview link (docs/15 §5.3, OS-4): `?collection=pages|posts&slug=…`. It checks the
 * session first: a member of the staff who may read that collection's drafts, signed in, with
 * their two-factor code entered (src/lib/preview/access.ts). Then the address, which must be
 * one the collection could have. It turns on Next.js's draft mode for this browser (a session
 * cookie, `__prerender_bypass`, in the cookie inventory) and opens the document at its own
 * address, so the draft is drawn by the route that will draw it, in its register. Anyone else
 * gets a plain 404 and no cookie. Leaving preview is /api/preview/exit; signing out leaves it
 * too (src/collections/Users.ts).
 */
export async function GET(request: NextRequest): Promise<Response> {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: request.headers })
  const parsed = previewRequest.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success || !canPreview(user, parsed.data.collection)) return notFound()
  ;(await draftMode()).enable()
  const response = NextResponse.redirect(new URL(previewPath(parsed.data), request.url), 303)
  for (const [name, value] of Object.entries(PRIVATE_HEADERS)) response.headers.set(name, value)
  return response
}
