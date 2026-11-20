import { revalidateTag } from 'next/cache'

/** The cache tag every page's data carries, and the tag of one page (docs/12 §1, §4). */
export const PAGES_TAG = 'pages'
export const pageTag = (slug: string) => `page:${slug}`

/**
 * Marks the cached data of pages stale, so that an editor's change is on the site at the next
 * request, with no rebuild (docs/12 §4). Outside a request (a script, a test, a migration)
 * there is no cache to mark; Next.js says so by throwing, and that is not an error here.
 */
export function revalidatePages(...slugs: (string | null | undefined)[]): void {
  try {
    revalidateTag(PAGES_TAG, { expire: 0 })
    for (const slug of slugs) if (slug) revalidateTag(pageTag(slug), { expire: 0 })
  } catch (error) {
    const outsideRequest = error instanceof Error && /store missing/i.test(error.message)
    if (!outsideRequest) throw error
  }
}
