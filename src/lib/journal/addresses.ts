/**
 * The Journal's addresses (docs/02): the list at /journal, its later pages at
 * /journal/page/<n>, a topic at /journal/topic/<topic> (and /journal/topic/<topic>/page/<n>),
 * and an article at /journal/<slug>. Clean addresses with no query (docs/12 §3, URLs): page 1
 * is the list itself, so /journal/page/1 redirects there. Pure, so the routes, the share
 * images, the sitemap and the tests all build the same addresses.
 */

/** The Journal's own address. */
export const JOURNAL_PATH = '/journal'

/** The Journal's name as a heading gives it (D-27), and as a breadcrumb and the footer do. */
export const JOURNAL_NAME = 'The Journal'
export const JOURNAL_CRUMB = 'Journal'

/** Articles on one page of a list, newest first. */
export const PAGE_SIZE = 10

/** An article's or a topic's address part: small letters, digits and single hyphens. */
export const JOURNAL_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Slugs no article may take: their addresses belong to the list's later pages and to the
 * topics (/journal/page/…, /journal/topic/…).
 */
export const RESERVED_SLUGS = ['page', 'topic'] as const

/** Whether a slug can be an article's: well formed, and not one the Journal keeps for itself. */
export function isArticleSlug(slug: string): boolean {
  return JOURNAL_SLUG.test(slug) && !(RESERVED_SLUGS as readonly string[]).includes(slug)
}

/** An article's address. */
export function articlePath(slug: string): string {
  return `${JOURNAL_PATH}/${slug}`
}

/** A list's address: the Journal or a topic, at a page; page 1 is the list itself. */
export function listPath(topic?: string, page = 1): string {
  const base = topic ? `${JOURNAL_PATH}/topic/${topic}` : JOURNAL_PATH
  return page > 1 ? `${base}/page/${page}` : base
}

/**
 * The page number in an address, or null for anything that is not one: digits only, no
 * leading zero, from 1 to 999, far beyond any list the Journal will have. "1" is a number
 * (its address redirects to the list).
 */
export function pageNumber(value: string): number | null {
  return /^[1-9]\d{0,2}$/.test(value) ? Number(value) : null
}

/** A topic's name holds this many characters at most (src/collections/Topics.ts). */
export const TOPIC_NAME_MAX = 30

/**
 * A list's search title (D-65): the Journal's own on its first page, "The Journal: <topic>"
 * for a topic, with ", page <n>" after the first page, so that no two pages share a title.
 * The longest, a topic of 30 characters at page 999, is the 53 characters a browser tab holds.
 */
export function listTitle(firstPageTitle: string, topicName?: string, page = 1): string {
  const title = topicName ? `${JOURNAL_NAME}: ${topicName}` : firstPageTitle
  return page > 1 ? `${topicName ? title : JOURNAL_NAME}, page ${page}` : title
}

/** What an address under /journal is, or null where nothing of the Journal's could be. */
export type JournalAddress =
  | { kind: 'list'; page: number }
  | { kind: 'topic'; topic: string; page: number }
  | { kind: 'article'; slug: string }

/**
 * An address below the site's root, without its first slash ("journal/topic/fake/page/2"), as
 * the Journal reads it. Page 1 of a list is only ever its bare address.
 */
export function parseJournalAddress(slug: string): JournalAddress | null {
  const parts = slug.split('/')
  if (parts[0] !== 'journal') return null
  const [, first, second, third, fourth, ...rest] = parts
  if (rest.length > 0) return null
  if (first === undefined) return { kind: 'list', page: 1 }
  if (first === 'page') {
    const page = second !== undefined && third === undefined ? pageNumber(second) : null
    return page && page > 1 ? { kind: 'list', page } : null
  }
  if (first === 'topic') {
    if (second === undefined || !JOURNAL_SLUG.test(second)) return null
    if (third === undefined) return { kind: 'topic', topic: second, page: 1 }
    const page = third === 'page' && fourth !== undefined ? pageNumber(fourth) : null
    return page && page > 1 ? { kind: 'topic', topic: second, page } : null
  }
  return second === undefined && isArticleSlug(first) ? { kind: 'article', slug: first } : null
}
