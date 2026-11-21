import { revalidateTag } from 'next/cache'

/** The cache tag every page's data carries, and the tag of one page (docs/12 §1, §4). */
export const PAGES_TAG = 'pages'
export const pageTag = (slug: string) => `page:${slug}`

/**
 * The tags of the Journal's data: every list and article carries the first, one article its
 * own too, and whatever shows a topic the topics' (docs/12 §1: revalidated on publish).
 */
export const POSTS_TAG = 'posts'
export const postTag = (slug: string) => `post:${slug}`
export const TOPICS_TAG = 'topics'

/**
 * Marks cached data stale, so that an editor's change is on the site at the next request, with
 * no rebuild (docs/12 §4). Outside a request (a script, a test, a migration) there is no cache
 * to mark; Next.js says so by throwing, and that is not an error here.
 */
function markStale(tags: string[]): void {
  try {
    for (const tag of tags) revalidateTag(tag, { expire: 0 })
  } catch (error) {
    const outsideRequest = error instanceof Error && /store missing/i.test(error.message)
    if (!outsideRequest) throw error
  }
}

const named = (slugs: (string | null | undefined)[]) =>
  slugs.filter((slug): slug is string => Boolean(slug))

/** Marks the list of pages and each named page stale. */
export function revalidatePages(...slugs: (string | null | undefined)[]): void {
  markStale([PAGES_TAG, ...named(slugs).map(pageTag)])
}

/**
 * Marks the Journal's lists and each named article stale: an article published, changed,
 * unpublished or deleted, at its new address and its old one.
 */
export function revalidatePosts(...slugs: (string | null | undefined)[]): void {
  markStale([POSTS_TAG, ...named(slugs).map(postTag)])
}

/** Marks the topics stale, and the lists and articles that show their names and doors. */
export function revalidateTopics(): void {
  markStale([TOPICS_TAG, POSTS_TAG])
}
