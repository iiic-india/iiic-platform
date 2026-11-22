import 'server-only'

import { draftMode, headers } from 'next/headers'
import { getPayload } from 'payload'
import { cache } from 'react'

import config from '@payload-config'

import { canPreview, canPreviewAny, type PreviewCollection } from './access'

/**
 * Who is previewing this request, read once however many components ask (docs/15 §5.3, OS-4):
 * nobody, unless Next.js's draft mode is on for the browser and the request carries a staff
 * session that has entered its two-factor code. Draft mode alone shows nothing: a visitor who
 * somehow holds the cookie, or staff whose session ended or never entered the code, get the
 * published page. Nothing here is cached beyond the request, and nothing outside a page's own
 * render asks (the feeds, llms.txt and the share images read published content only).
 */
const previewSession = cache(async (): Promise<unknown> => {
  if (!(await draftModeOn())) return null
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  return canPreviewAny(user) ? user : null
})

/**
 * Whether draft mode is on for this request. Outside a request (a script, a test rendering a
 * page by itself) Next.js has no draft mode to read and throws: that is no preview.
 */
async function draftModeOn(): Promise<boolean> {
  try {
    return (await draftMode()).isEnabled
  } catch {
    return false
  }
}

/** The staff user previewing a collection's drafts in this request, or null. */
export async function previewer(collection: PreviewCollection): Promise<unknown> {
  const user = await previewSession()
  return user && canPreview(user, collection) ? user : null
}

/** Whether this request is a preview of anything: what the preview notice and refresher ask. */
export async function previewing(): Promise<boolean> {
  return (await previewSession()) !== null
}
