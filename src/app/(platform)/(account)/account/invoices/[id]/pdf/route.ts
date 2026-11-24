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
  'Downloading an invoice from My IIIC',
  async (account: AccountSession, id: number) =>
    documentResponse(
      await downloadOwnDocument(await accountRequest(), account, { kind: 'invoice', id }),
    ),
)

/**
 * GET /account/invoices/[id]/pdf (docs/20 §5, §7.4): an issued invoice or credit note of the
 * account's bookings from the private bucket, only while `prices_public` is on (D-118), with
 * `download-invoice` written to the audit log in the account's name before the file is sent
 * (`private, no-store`, an attachment). The flag and the session come first; an invoice that is
 * not the account's, or any invoice while prices are hidden, is a 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const account = await openMyIiicRoute('/account/invoices')
  if (!account) return new Response('Not found', { status: 404, headers: DOCUMENT_HEADERS })
  return send(account, documentId((await params).id))
}
