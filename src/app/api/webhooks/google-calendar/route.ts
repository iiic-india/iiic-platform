import { createLocalReq, getPayload } from 'payload'

import { calendarDeps } from '@/lib/calendar/calendarFor'
import { handleChangeNotificationWith, readNotification } from '@/lib/calendar/notifications'
import config from '@payload-config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
const answer = (status: number) => new Response(null, { status, headers: HEADERS })

/**
 * Google Calendar's change notifications (B14; docs/07). No one signs in here: the caller is
 * checked instead, before anything else, by the channel's token against the hash its connection
 * keeps and by the watched resource (notifications.ts); a notification that fails either is
 * refused and changes nothing. A believed one has that practitioner's busy times read again. The
 * body is never read. Google tries again only after a 5xx, which a database fault gives; a
 * calendar that does not answer is caught up by the 15-minute sweep instead.
 */
export async function POST(request: Request) {
  const notice = readNotification(request.headers)
  if (!notice.success) return answer(400)
  const deps = calendarDeps()
  if (!deps.provider.ok) return answer(404)
  const payload = await getPayload({ config })
  const req = await createLocalReq({}, payload)
  try {
    const result = await handleChangeNotificationWith(deps, req, notice.data, new Date())
    if (!result.ok) return answer(result.error.code === 'bad-token' ? 401 : 404)
    payload.logger.info({ msg: 'Calendar notification', outcome: result.value })
    return answer(200)
  } catch (error) {
    // The error's name only: its message can carry the query and a calendar's address.
    payload.logger.error(
      `Calendar notification failed (${error instanceof Error ? error.name : 'unknown error'}).`,
    )
    return answer(500)
  }
}
