import { CERTIFICATES_COPY as COPY } from '@/components/admin/certificates/certificatesCopy'
import { json, readJson, refusalResponse, staffRequest } from '@/lib/certificates/http'
import { certificateActions } from '@/lib/certificates/wiring'
import { answeringFaults } from '@/lib/monitoring/routeFaults'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

/**
 * POST /api/certificates/<id>/revoke (docs/18 §4): revokes a certificate with a reason, audited
 * as `revoke-certificate`; the verify page shows Revoked at once. Owners only, signed in with the
 * code; checked before the body is read.
 */
async function post(request: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await staffRequest(request, 'certificatesRevoke')
  if (!staff.ok) return staff.response
  const body = await readJson(request)
  if (!body.ok) return body.response
  const { id } = await context.params
  const { reason } = (body.body ?? {}) as { reason?: unknown }
  const revoked = await certificateActions().revoke(staff.req, {
    certificateId: Number(id),
    reason,
  })
  if (!revoked.ok) return refusalResponse(revoked.error)
  const { certificateId } = await staff.req.payload.findByID({
    collection: 'certificates',
    id: revoked.value.id,
    depth: 0,
    select: { certificateId: true },
    overrideAccess: false,
    req: staff.req,
  })
  return json({ id: revoked.value.id, message: COPY.revoked(certificateId) })
}

export const POST = answeringFaults('Revoking a certificate', post)
