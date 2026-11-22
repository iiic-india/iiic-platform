import { revalidateTag } from 'next/cache'

/** The cache tag of the redirects the site answers old addresses with (docs/12 §1, §4). */
export const REDIRECTS_TAG = 'redirects'

/**
 * Marks the cached redirects stale, so that a redirect made, changed or removed in the admin is
 * followed (or not) at the next request. Outside a request (a script, a test, a migration)
 * there is no cache to mark; Next.js says so by throwing, and that is not an error here.
 */
export function revalidateRedirects(): void {
  try {
    revalidateTag(REDIRECTS_TAG, { expire: 0 })
  } catch (error) {
    const outsideRequest = error instanceof Error && /store missing/i.test(error.message)
    if (!outsideRequest) throw error
  }
}
