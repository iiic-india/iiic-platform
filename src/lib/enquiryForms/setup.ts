import 'server-only'

import { getPayload, type Payload } from 'payload'

import { env } from '@/lib/env'
import { currentNotice } from '@/lib/privacy/consents'
import { DEFAULT_LANGUAGE } from '@/lib/site/languages'
import type { PageContent } from '@/lib/content/types'
import config from '@payload-config'

import { signDrawn } from './guards'
import { type NoticeShown, NO_FORMS, type PageForms } from './state'
import { turnstileKeys } from './turnstile'

/**
 * What a page needs to draw its forms (docs/17 §6; FormSetup in ./state.ts), read on the server
 * when the page is drawn, and only for a page that carries one.
 */

const BLOCK_KINDS = { teamMapRequest: 'teamMap', partnershipEnquiry: 'partnership' } as const

/** The consent text in force for replies to an enquiry, in the site's language. */
export async function enquiryNotice(
  payload: Payload,
  now: Date = new Date(),
): Promise<NoticeShown | null> {
  const notice = await currentNotice(payload, 'enquiryReplies', DEFAULT_LANGUAGE, now)
  return notice ? { version: notice.version, text: notice.text } : null
}

/** The forms on a page and what each needs, read only when the page has one. */
export async function formsFor(
  layout: PageContent['layout'],
  page: string,
  now: Date = new Date(),
): Promise<PageForms> {
  const kinds = layout.flatMap((block) =>
    block.blockType in BLOCK_KINDS ? [BLOCK_KINDS[block.blockType as keyof typeof BLOCK_KINDS]] : [],
  )
  if (kinds.length === 0) return NO_FORMS
  const notice = await enquiryNotice(await getPayload({ config }), now)
  const keys = turnstileKeys(env())
  const forms: PageForms = {}
  for (const kind of kinds) {
    forms[kind] = {
      notice,
      drawn: signDrawn(env().PAYLOAD_SECRET, kind, now),
      turnstileSiteKey: keys?.siteKey ?? null,
      page,
    }
  }
  return forms
}
