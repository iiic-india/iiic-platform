import { bookingForThisBrowser, flowRequest } from '@/lib/bookingFlow/server'
import { bookingInvite } from '@/lib/calendar/bookingInvite'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

const HEADERS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }

/**
 * GET /book/confirmed/[ref]/invite.ics: "add to calendar" on the confirmation (docs/03 F3,
 * step 5), the same invitation the confirmation message carries (src/lib/calendar/
 * bookingInvite.ts; docs/16 §7). Only for the browser that made the booking (the booking cookie),
 * and only once it is confirmed with a time; anyone else gets a 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  const req = await flowRequest()
  const booking = await bookingForThisBrowser(req, ref)
  if (!booking || booking.status !== 'confirmed' || !booking.startsAt) {
    return new Response('Not found', { status: 404, headers: HEADERS })
  }
  const invite = await bookingInvite(req, { bookingId: booking.id, siteUrl: env().siteUrl })
  if (!invite.ok) return new Response('Not found', { status: 404, headers: HEADERS })
  return new Response(invite.value, {
    status: 200,
    headers: {
      ...HEADERS,
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${booking.reference}.ics"`,
    },
  })
}
