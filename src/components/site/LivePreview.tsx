'use client'

import { RefreshRouteOnSave } from '@payloadcms/live-preview-react'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useSyncExternalStore } from 'react'

import { exitPreviewUrl } from '@/lib/preview/routes'

import styles from './Preview.module.css'
import { PREVIEW_COPY } from './previewCopy'

/** Nothing to listen to: where the page was opened from does not change while it is open. */
const unchanging = () => () => {}

/** This origin, when the page is in a frame or a window another page opened; else null. */
const openedOrigin = () =>
  window.parent !== window || window.opener ? window.location.origin : null

/**
 * What a preview adds to the page (docs/15 §5.3, OS-4), drawn only for staff who are previewing
 * (Preview.tsx): a notice above the header that this is the newest saved version, with the way
 * out, and, inside the admin's live preview, Payload's refresher, which reloads the page from
 * the server each time the editor saves. The refresher listens only to messages from this
 * origin, where the admin is, and starts only in a frame or a window the admin opened.
 */
export function LivePreview() {
  const router = useRouter()
  const pathname = usePathname()
  const origin = useSyncExternalStore(unchanging, openedOrigin, () => null)
  const refresh = useCallback(() => router.refresh(), [router])

  return (
    <>
      <div className={`iiic-alert iiic-alert-yellow ${styles.notice}`} role="status">
        <strong>{PREVIEW_COPY.title}</strong> {PREVIEW_COPY.line}{' '}
        <a href={exitPreviewUrl(pathname ?? '/')}>{PREVIEW_COPY.leave}</a>
      </div>
      {origin ? <RefreshRouteOnSave refresh={refresh} serverURL={origin} /> : null}
    </>
  )
}
