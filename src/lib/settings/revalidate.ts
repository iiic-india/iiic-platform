import { revalidateTag } from 'next/cache'

/** The cache tag every read of the settings carries (docs/12 §1, §4). */
export const SETTINGS_TAG = 'settings'

/**
 * Marks the cached settings stale, so that an owner's change reaches the footer, /legal and the
 * flags at the next request, with no rebuild. Outside a request (a script, a test, a migration)
 * there is no cache to mark; Next.js says so by throwing, and that is not an error here.
 */
export function revalidateSettings(): void {
  try {
    revalidateTag(SETTINGS_TAG, { expire: 0 })
  } catch (error) {
    const outsideRequest = error instanceof Error && /store missing/i.test(error.message)
    if (!outsideRequest) throw error
  }
}
