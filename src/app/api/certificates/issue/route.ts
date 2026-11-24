import { CERTIFICATES_COPY as COPY } from '@/components/admin/certificates/certificatesCopy'
import { json, readJson, refusalResponse, staffRequest } from '@/lib/certificates/http'
import { certificateActions } from '@/lib/certificates/wiring'
import { answeringFaults } from '@/lib/monitoring/routeFaults'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// A batch of 200 renders 200 PDFs inside one request.
export const maxDuration = 300

/**
 * POST /api/certificates/issue (docs/18 §4): issues every recipient's certificate in one
 * transaction, each audited as `issue-certificate`. Owner and operator, signed in with the code;
 * checked before the body is read. A failure anywhere issues nothing.
 */
async function post(request: Request) {
  const staff = await staffRequest(request, 'certificatesIssue')
  if (!staff.ok) return staff.response
  const body = await readJson(request)
  if (!body.ok) return body.response
  const issued = await certificateActions().issue(staff.req, body.body)
  if (!issued.ok) return refusalResponse(issued.error)
  return json({
    issued: issued.value,
    message: COPY.issued(issued.value.map(({ certificateId }) => certificateId)),
  })
}

export const POST = answeringFaults('Issuing certificates', post)
