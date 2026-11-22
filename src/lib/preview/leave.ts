import { draftMode } from 'next/headers'
import type { CollectionAfterLogoutHook } from 'payload'

/**
 * Signing out leaves preview too (docs/15 §5.3, OS-4): the draft-mode cookie goes with the
 * session and the two-factor cookie, so the browser holds nothing of the preview afterwards.
 * A draft would not show without the session anyway (src/lib/preview/session.ts). Outside a
 * request (a script, a test) there is no browser to clear, and Next.js says so by throwing.
 */
export const leavePreviewAfterLogout: CollectionAfterLogoutHook = async () => {
  try {
    ;(await draftMode()).disable()
  } catch {
    // No request: nothing to clear.
  }
}
