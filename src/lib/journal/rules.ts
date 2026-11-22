import { hasPlaceholder } from '@/lib/seo/site'

/**
 * The rules a Journal article and its topics are held to, as plain functions: the collections
 * run them (src/collections/Posts.ts, Topics.ts) and the tests read them. An article is IIIC's
 * finished text, so unlike a starter page it carries no placeholder anywhere (CLAUDE.md #1):
 * one would show as brackets on the page, in a search result or on the reader's clipboard.
 */

/** The search title's limit: the tab and the results add " · IIIC" (docs/12 §3, D-65). */
export const SEARCH_TITLE_MAX = 53

/** A search description's limit (docs/12 §3, D-65); an article's excerpt keeps to it too. */
export const DESCRIPTION_MAX = 155

/** An article's title: Google reads headlines of up to 110 characters (docs/12 §3). */
export const ARTICLE_TITLE_MAX = 110

/**
 * The question an article ends with, as it fits a line or two; and an author's name, as it fits
 * one line under the title of the article's share image (src/lib/seo/shareImage.tsx).
 */
export const QUESTION_MAX = 280
export const AUTHOR_NAME_MAX = 40

/**
 * A text that holds a placeholder, or brackets or a TODO that look like one, is refused: the
 * same test every search surface applies (src/lib/seo/site.ts).
 */
export function withoutPlaceholder(value: unknown): true | string {
  return (
    typeof value !== 'string' ||
    !hasPlaceholder(value) ||
    'The Journal shows what IIIC wrote, as it is: write this without a placeholder.'
  )
}

/** A text that holds words, not only spaces. */
export function holdsWords(value: unknown, what: string): true | string {
  return (typeof value === 'string' && value.trim() !== '') || `Write the ${what}.`
}

/** The question to sit with is a question (docs/11 §3.6): it ends with a question mark. */
export function isQuestion(value: unknown): true | string {
  return (
    (typeof value === 'string' && /\?["'’”)]*$/.test(value.trim())) ||
    'Write the question as a question, ending with a question mark.'
  )
}

/**
 * The title search results and the browser tab show for an article: its search title, or its
 * own title while that fits the tab. A title longer than that needs a search title before the
 * article is published (src/collections/Posts.ts).
 */
export function searchTitleOf(post: { title: string; searchTitle?: string | null }): string {
  const searchTitle = post.searchTitle?.trim()
  return searchTitle ? searchTitle : post.title
}

/** Whether an article's own title is too long to serve as its search title. */
export function needsSearchTitle(title: unknown): boolean {
  return typeof title === 'string' && [...title.trim()].length > SEARCH_TITLE_MAX
}
