import { createLocalReq, getPayload } from 'payload'

import { env } from '@/lib/env'
import { readWebhookBody } from '@/lib/messaging/body'
import { recordInbound } from '@/lib/messaging/conversation'
import { handleWhatsAppWebhook, WHATSAPP_SECRET_HEADER } from '@/lib/messaging/inbound'
import { applyReport } from '@/lib/messaging/report'
import config from '@payload-config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30
export const preferredRegion = 'bom1'

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }

/**
 * POST /api/webhooks/whatsapp (docs/19 §4): the WhatsApp provider's statuses and the messages
 * people send. No sign-in: the caller proves itself with `WHATSAPP_WEBHOOK_SECRET` in a header,
 * compared in constant time before the database is touched (proposed until AiSensy's plan signs,
 * docs/19 §10). A status moves the message forward; a message from a person opens the 24-hour
 * window, and a plain STOP suppresses WhatsApp for the number and withdraws `marketingWhatsapp`.
 * The text of a message is never stored or logged.
 */
export async function POST(request: Request) {
  const rawBody = await readWebhookBody(request)
  const answer = await handleWhatsAppWebhook(
    { rawBody, secretHeader: request.headers.get(WHATSAPP_SECRET_HEADER) },
    {
      secret: env().WHATSAPP_WEBHOOK_SECRET,
      now: () => new Date(),
      apply: async (report) => {
        const payload = await getPayload({ config })
        return applyReport(await createLocalReq({}, payload), report)
      },
      inbound: async (notice, messageId) => {
        const payload = await getPayload({ config })
        await recordInbound(await createLocalReq({}, payload), notice, messageId)
      },
    },
  )
  if (answer.status === 500) {
    const payload = await getPayload({ config })
    payload.logger.error('webhooks: a WhatsApp notice could not be applied')
  }
  return Response.json(answer.body, { status: answer.status, headers: HEADERS })
}
