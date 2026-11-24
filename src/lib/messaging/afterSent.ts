import 'server-only'

import type { PayloadRequest } from 'payload'

import { IST } from '@/lib/time/ist'
import type { Message } from '@/payload-types'

/**
 * What a sent message records on the record it is about (docs/18 §5): O7's acknowledgement
 * carries the complaint as recorded, so once it has gone the request's `complaintCopySentAt` says
 * when, unless the office recorded it already. Nothing else records anything on sending. A fault
 * here never undoes the send: the message stays sent and the office can type the time itself.
 */
export async function afterSent(req: PayloadRequest, message: Message, now: Date): Promise<void> {
  if (message.template !== 'complaint-ack' || message.subjectCollection !== 'data-requests') return
  try {
    const request = await req.payload.findByID({
      collection: 'data-requests',
      id: message.subjectId,
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
      select: { complaintCopySentAt: true },
      req,
    })
    if (!request || request.complaintCopySentAt) return
    await req.payload.update({
      collection: 'data-requests',
      id: message.subjectId,
      data: { complaintCopySentAt: now.toISOString(), complaintCopySentAt_tz: IST },
      depth: 0,
      overrideAccess: true,
      req,
    })
  } catch {
    req.payload.logger.warn({
      msg: 'messages: the complaint copy was not recorded',
      id: message.id,
    })
  }
}
