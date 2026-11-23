import 'server-only'

import { getPayload, type Payload } from 'payload'

import { env } from '@/lib/env'
import { currentNotice } from '@/lib/privacy/consents'
import { DEFAULT_LANGUAGE } from '@/lib/site/languages'
import type { PageContent } from '@/lib/content/types'
import config from '@payload-config'

import { signDrawn } from './guards'
import type { NoticeShown } from './state'
import type { EnquiryFormKind } from './strings'
import { turnstileKeys } from './turnstile'

/**
 * What a page needs to draw its form (docs/17 §6), read on the server when the page is drawn:
 * the consent text in force for `enquiryReplies` (none, and the form is not shown), the signed
 * time the form is drawn at, Turnstile's site key where both its keys are set, and the page's
 * own address, which the form sends back and which its acknowledgement leaves the person on.
 */
export type FormSetup = {
  notice: NoticeShown | null
  drawn: string
  turnstileSiteKey: string | null
  page: string
}

/** The forms a page carries, by kind; a page without one has none. */
export type PageForms = Partial<Record<EnquiryFormKind, FormSetup>>

export const NO_FORMS: PageForms = {}

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
