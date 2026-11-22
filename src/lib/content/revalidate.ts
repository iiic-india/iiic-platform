import { revalidateTag } from 'next/cache'

/** The cache tag every page's data carries, and the tag of one page (docs/12 §1, §4). */
export const PAGES_TAG = 'pages'
export const pageTag = (slug: string) => `page:${slug}`

/** The cache tag of every page's questions, and the tag of one page's (src/lib/content/faqs.ts). */
export const FAQS_TAG = 'faqs'
export const faqsTag = (slug: string) => `faqs:${slug}`

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
function expire(tags: string[]): void {
  try {
    for (const tag of tags) revalidateTag(tag, { expire: 0 })
  } catch (error) {
    const outsideRequest = error instanceof Error && /store missing/i.test(error.message)
    if (!outsideRequest) throw error
  }
}

/** The slugs given, without the empty ones. */
const named = (slugs: (string | null | undefined)[]) =>
  slugs.filter((slug): slug is string => Boolean(slug))

/** Marks the list and each named page stale. */
export function revalidatePages(...slugs: (string | null | undefined)[]): void {
  expire([PAGES_TAG, ...named(slugs).map(pageTag)])
}

/**
 * Marks the questions of each named page stale: the page a question belongs to now, and the one
 * it belonged to before a move, so both pages and their structured data change at once.
 */
export function revalidateFaqs(...slugs: (string | null | undefined)[]): void {
  expire([FAQS_TAG, ...named(slugs).map(faqsTag)])
}

/**
 * Marks the Journal's lists and each named article stale: an article published, changed,
 * unpublished or deleted, at its new address and its old one.
 */
export function revalidatePosts(...slugs: (string | null | undefined)[]): void {
  expire([POSTS_TAG, ...named(slugs).map(postTag)])
}

/** Marks the topics stale, and the lists and articles that show their names and doors. */
export function revalidateTopics(): void {
  expire([TOPICS_TAG, POSTS_TAG])
}

/** The cache tag of the published reviews: Proof and every voice beside a section (docs/11 §3.8). */
export const REVIEWS_TAG = 'testimonials'

/**
 * Marks the published reviews stale: Proof and every page that shows a voice read them anew
 * when a review is published, changed, withdrawn or deleted (docs/06 V2: at once).
 */
export function revalidateReviews(): void {
  expire([REVIEWS_TAG])
}
