import { json, readJson, refusalResponse, staffRequest } from '@/lib/certificates/http'
import { certificateActions } from '@/lib/certificates/wiring'
import { answeringFaults } from '@/lib/monitoring/routeFaults'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * POST /api/certificates/preview (docs/18 §4): each recipient's page filled from the kit's
 * template, with a sample ID and QR code marked as a preview. Nothing is stored. Owner and
 * operator, signed in with the code; checked before the body is read.
 */
async function post(request: Request) {
  const staff = await staffRequest(request, 'certificatesIssue')
  if (!staff.ok) return staff.response
  const body = await readJson(request)
  if (!body.ok) return body.response
  const pages = await certificateActions().preview(staff.req, body.body)
  if (!pages.ok) return refusalResponse(pages.error)
  return json({ pages: pages.value })
}

export const POST = answeringFaults('Previewing certificates', post)
