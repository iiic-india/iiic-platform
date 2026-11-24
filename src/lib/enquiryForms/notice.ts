import type { Payload } from 'payload'

import { currentNotice } from '@/lib/privacy/consents'
import { DEFAULT_LANGUAGE } from '@/lib/site/languages'

import type { NoticeShown } from './state'

/**
 * The consent text in force for replies to an enquiry (`enquiryReplies`, docs/17 §6), in the
 * site's language: what the form shows beside its box, and the only version the form is taken
 * under. None, and the form is not shown (Content → Consent texts; I-22). Server code, though
 * free of `server-only`, as src/lib/privacy/consents.ts is: it holds no secret, and the
 * placeholders report reads it too.
 */
export async function enquiryNotice(
  payload: Payload,
  now: Date = new Date(),
): Promise<NoticeShown | null> {
  const notice = await currentNotice(payload, 'enquiryReplies', DEFAULT_LANGUAGE, now)
  return notice ? { version: notice.version, text: notice.text } : null
}
