import { PRIVATE_HEADERS, refusalResponse, staffRequest } from '@/lib/certificates/http'
import { certificateActions } from '@/lib/certificates/wiring'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

/**
 * GET /api/certificates/<id>/pdf (docs/18 §4): a certificate's PDF from the private bucket, for
 * the office (owner, operator, signed in with the code). The file is checked against the SHA-256
 * kept at issue and the download is recorded as `download-certificate` before it is sent.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await staffRequest(request, 'certificatesIssue')
  if (!staff.ok) return staff.response
  const { id } = await context.params
  const file = await certificateActions().download(staff.req, id)
  if (!file.ok) return refusalResponse(file.error)
  return new Response(Buffer.from(file.value.pdf), {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${file.value.certificateId}.pdf"`,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
