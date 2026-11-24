import { createLocalReq, getPayload } from 'payload'

import { env } from '@/lib/env'
import { readWebhookBody } from '@/lib/messaging/body'
import { handleResendWebhook } from '@/lib/messaging/inbound'
import { applyReport } from '@/lib/messaging/report'
import config from '@payload-config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30
export const preferredRegion = 'bom1'

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }

/**
 * POST /api/webhooks/resend (docs/19 §4): Resend's delivery, bounce, complaint and failure
 * events. No sign-in: the caller is Resend, proved by the Svix signature over the raw body, which
 * is checked before the database is touched; a preview, which shares production's database,
 * refuses with 404 before anything is read. A permanent bounce or a complaint suppresses the
 * address; a replayed event changes nothing. See src/lib/messaging/inbound.ts for every answer.
 * Nothing from the body is logged or echoed.
 */
export async function POST(request: Request) {
  const rawBody = await readWebhookBody(request)
  const answer = await handleResendWebhook(
    {
      rawBody,
      svixId: request.headers.get('svix-id'),
      svixTimestamp: request.headers.get('svix-timestamp'),
      svixSignature: request.headers.get('svix-signature'),
    },
    {
      secret: env().RESEND_WEBHOOK_SECRET,
      vercelEnv: env().VERCEL_ENV,
      apply: async (report) => {
        const payload = await getPayload({ config })
        return applyReport(await createLocalReq({}, payload), report)
      },
    },
  )
  if (answer.status === 500) {
    const payload = await getPayload({ config })
    payload.logger.error('webhooks: a Resend event could not be applied')
  }
  return Response.json(answer.body, { status: answer.status, headers: HEADERS })
}
