import { json, refusalResponse, staffRequest } from '@/lib/certificates/http'
import { findRecipients } from '@/lib/certificates/recipients'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 10

/**
 * GET /api/certificates/recipients?q=<name> or ?event=<id> (docs/18 §4): the people the issue
 * screen can add, by name or by an event's bookings, as id and full name only. Owner and operator,
 * signed in with the code; checked before the query is read. No query is logged.
 */
export async function GET(request: Request) {
  const staff = await staffRequest(request, 'certificatesIssue')
  if (!staff.ok) return staff.response
  const params = new URL(request.url).searchParams
  const query = params.has('event') ? { event: params.get('event') } : { q: params.get('q') ?? '' }
  const people = await findRecipients(staff.req, query)
  if (!people.ok) return refusalResponse(people.error)
  return json({ people: people.value })
}
