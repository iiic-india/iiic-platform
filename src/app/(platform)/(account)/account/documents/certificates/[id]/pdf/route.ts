import type { AccountSession } from '@/lib/accounts/contract'
import {
  DOCUMENT_HEADERS,
  documentId,
  documentResponse,
  downloadOwnDocument,
} from '@/lib/accounts/documents'
import { accountRequest, openMyIiicRoute } from '@/lib/accounts/scope'
import { answeringFaults } from '@/lib/monitoring/routeFaults'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

const send = answeringFaults(
  'Downloading a certificate from My IIIC',
  async (account: AccountSession, id: number) =>
    documentResponse(
      await downloadOwnDocument(await accountRequest(), account, { kind: 'certificate', id }),
    ),
)

/**
 * GET /account/documents/certificates/[id]/pdf (docs/20 §5, §7.3): a valid certificate of the
 * account's from the private bucket, checked against the SHA-256 kept at issue, with
 * `download-certificate` written to the audit log in the account's name before the file is sent
 * (`private, no-store`, an attachment). The flag and the session come first; a certificate that is
 * not the account's, or one revoked, is a 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await openMyIiicRoute('/account/documents')
  if (!account) return new Response('Not found', { status: 404, headers: DOCUMENT_HEADERS })
  return send(account, documentId((await params).id))
}
