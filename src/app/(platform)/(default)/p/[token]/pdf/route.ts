import { createLocalReq, getPayload } from 'payload'

import { pdfResponse } from '@/lib/pipeline/proposal/endpoints'
import { isLinkToken, linkPath } from '@/lib/pipeline/proposal/tokens'
import { proposals } from '@/lib/pipeline/proposal/wiring'
import config from '@payload-config'

// docs/12 §6: every route handler declares its runtime and its time limit. Printing takes a while.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const PRIVATE = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
}

/** Back to the link's page, which says the link no longer opens a proposal. */
const toPage = (token: string) =>
  new Response(null, {
    status: 303,
    headers: { ...PRIVATE, Location: isLinkToken(token) ? linkPath(token) : '/' },
  })

/**
 * A proposal's PDF through its tracked link (docs/17 §5; src/lib/pipeline/proposal/track.ts).
 * This address, not the page, counts an opening: the first moves a sent proposal to viewed. A
 * closed or unknown link goes back to the page, which reads alike for every case. Nothing is
 * logged about the token, the proposal or the client.
 */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  if (!isLinkToken(token)) return toPage(token)
  const payload = await getPayload({ config })
  const req = await createLocalReq({}, payload)
  try {
    const opened = await proposals().open(req, { token, now: new Date() })
    if (!opened.ok) return toPage(token)
    const response = pdfResponse(opened.value.pdf, opened.value.filename)
    for (const [key, value] of Object.entries(PRIVATE)) response.headers.set(key, value)
    return response
  } catch (error) {
    payload.logger.error(
      `A proposal's PDF could not be opened (${error instanceof Error ? error.name : 'unknown error'}).`,
    )
    return new Response(null, { status: 500, headers: PRIVATE })
  }
}
