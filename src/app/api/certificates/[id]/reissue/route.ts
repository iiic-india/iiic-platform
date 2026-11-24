import { CERTIFICATES_COPY as COPY } from '@/components/admin/certificates/certificatesCopy'
import {
  json,
  readJson,
  refusalResponse,
  staffRequest,
  withoutBlanks,
} from '@/lib/certificates/http'
import { certificateActions } from '@/lib/certificates/wiring'
import { answeringFaults } from '@/lib/monitoring/routeFaults'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/certificates/<id>/reissue (docs/18 §4): revokes the certificate with the reason and
 * issues its corrected replacement in one transaction, audited as `reissue-certificate`; the old
 * page then names the new ID. Owners only, signed in with the code; checked before the body is
 * read. A field left blank keeps what printed.
 */
async function post(request: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await staffRequest(request, 'certificatesRevoke')
  if (!staff.ok) return staff.response
  const body = await readJson(request)
  if (!body.ok) return body.response
  const { id } = await context.params
  const reissued = await certificateActions().reissue(staff.req, {
    ...withoutBlanks(body.body),
    certificateId: Number(id),
  })
  if (!reissued.ok) return refusalResponse(reissued.error)
  return json({ ...reissued.value, message: COPY.reissued(reissued.value.certificateId) })
}

export const POST = answeringFaults('Reissuing a certificate', post)
