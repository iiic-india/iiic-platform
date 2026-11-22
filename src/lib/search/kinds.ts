/**
 * What site search covers (docs/02 `/search`; docs/04 `search_index`; docs/11 §5.3): the
 * published pages, the active services, the published Journal articles and the published
 * questions, each a kind of result with its own heading on /search and its own priority in the
 * index. The order here is the order of the groups on the results page.
 */

/** The search index's collection, as Payload's search plugin keeps it (table `search_index`). */
export const SEARCH_INDEX = 'search-index' as const

/** The collections the index holds entries for, in the order their groups are shown. */
export const SEARCHED_COLLECTIONS = ['pages', 'services', 'posts', 'faqs'] as const

export type SearchKind = (typeof SEARCHED_COLLECTIONS)[number]

/**
 * Each kind's heading on the results page and the priority its entries start with: a page
 * before a service, a service before an article, an article before a question. An editor may
 * change one entry's priority in the admin; the index keeps it from then on.
 */
export const SEARCH_KINDS: Record<SearchKind, { heading: string; priority: number }> = {
  pages: { heading: 'Pages', priority: 40 },
  services: { heading: 'Services', priority: 30 },
  posts: { heading: 'From the Journal', priority: 20 },
  faqs: { heading: 'Questions and answers', priority: 10 },
}

/** Whether a value names a kind the index holds. */
export function isSearchKind(value: unknown): value is SearchKind {
  return typeof value === 'string' && (SEARCHED_COLLECTIONS as readonly string[]).includes(value)
}
