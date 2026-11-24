import { createLocalReq, getPayload } from 'payload'

import { practitionerFeed } from '@/lib/calendar/feed'
import { FeedToken } from '@/lib/calendar/tokens'
import { env } from '@/lib/env'
import config from '@payload-config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

const PRIVATE = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
}

const notFound = () =>
  new Response('Not found', {
    status: 404,
    headers: { ...PRIVATE, 'Content-Type': 'text/plain; charset=utf-8' },
  })

/**
 * A practitioner's private feed of their own bookings (D-22; docs/16 §7). No one signs in: a
 * calendar app subscribes with the address. The token in it is checked first, against the hash
 * on a calendar connection; a malformed, unknown or revoked token, or a practitioner whose staff
 * account is switched off, gets the same plain 404. The feed is never cached anywhere.
 */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  if (!FeedToken.safeParse(token).success) return notFound()
  const payload = await getPayload({ config })
  try {
    const req = await createLocalReq({}, payload)
    const feed = await practitionerFeed(req, { token, siteUrl: env().siteUrl, now: new Date() })
    if (!feed.ok) {
      if (feed.error.code === 'not-found') return notFound()
      payload.logger.error({ msg: 'Calendar feed could not be written', outcome: feed.error.code })
      return new Response(null, { status: 500, headers: PRIVATE })
    }
    return new Response(feed.value, {
      status: 200,
      headers: {
        ...PRIVATE,
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="iiic-bookings.ics"',
      },
    })
  } catch (error) {
    payload.logger.error(
      `Calendar feed failed (${error instanceof Error ? error.name : 'unknown error'}).`,
    )
    return new Response(null, { status: 500, headers: PRIVATE })
  }
}
