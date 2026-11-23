import 'server-only'

import { getPayload } from 'payload'

import { env } from '@/lib/env'
import type { PageContent } from '@/lib/content/types'
import config from '@payload-config'

import { sendPartnershipEnquiry, sendTeamMapRequest } from './actions'
import { signDrawn } from './guards'
import { enquiryNotice } from './notice'
import { type EnquiryFormAction, formKindsIn, NO_FORMS, type PageForms } from './state'
import type { EnquiryFormKind } from './strings'
import { turnstileKeys } from './turnstile'

/**
 * What a page needs to draw its forms (docs/17 §6; FormSetup in ./state.ts), read on the server
 * when the page is drawn, and only for a page that carries one: the notice in force, the signed
 * time the form is drawn at, Turnstile's site key where both its keys are set, the page's own
 * address, and the form's server action, which the page hands to the form.
 */

const ACTIONS: Record<EnquiryFormKind, EnquiryFormAction> = {
  teamMap: sendTeamMapRequest,
  partnership: sendPartnershipEnquiry,
}

export async function formsFor(
  layout: PageContent['layout'],
  page: string,
  now: Date = new Date(),
): Promise<PageForms> {
  const kinds = formKindsIn(layout)
  if (kinds.length === 0) return NO_FORMS
  const settings = env()
  const notice = await enquiryNotice(await getPayload({ config }), now)
  const keys = turnstileKeys(settings)
  const forms: PageForms = {}
  for (const kind of kinds) {
    forms[kind] = {
      notice,
      drawn: signDrawn(settings.PAYLOAD_SECRET, kind, now),
      turnstileSiteKey: keys?.siteKey ?? null,
      page,
      action: ACTIONS[kind],
    }
  }
  return forms
}
