import { pagePath } from '@/lib/content/slug'
import { isArticleSlug } from '@/lib/journal/addresses'

/**
 * The narrative pages and the devices each one carries (docs/11 §3): the bar on all three, and
 * on each the devices its sections call for. Every other page, counselling and booking above
 * all, carries none (docs/11 §2, principle 6). Pure: the header's bar reads it in the browser,
 * the page renderer on the server.
 */
export type Devices = {
  /** A comparison is drawn as Flip the line, with its plain table behind "Show both" (§3.2). */
  flip?: boolean
  /** A list section keeps its question in view beside its answers on wide screens (§3.3). */
  stickyQuestion?: boolean
  /**
   * The sections between the hero and the closing band are chapters that reveal once, and a
   * set of cards without links is set out as titles beside their text, with the bar marking the
   * one in view (§3.3, §3.5).
   */
  chapters?: boolean
  /**
   * The doors' cards (stagger 60 ms) and the steps reveal once as they come into view (§4,
   * rows 2 and 4; §7): held back only below the window, once the script runs.
   */
  reveals?: boolean
}

/**
 * By slug. The home page flips a comparison once it carries one: its two pairs wait on IIIC's
 * choice (docs/11 §3.2; I-41).
 */
const NARRATIVE_PAGES: ReadonlyMap<string, Devices> = new Map([
  ['home', { flip: true, reveals: true }],
  ['framework', { flip: true, stickyQuestion: true }],
  ['founders', { chapters: true }],
])

/** Where the narrative pages live: "/" for the home page, never "/home". */
const NARRATIVE_PATHS: ReadonlySet<string> = new Set([...NARRATIVE_PAGES.keys()].map(pagePath))

/** The devices on the page at a slug: none, unless it is a narrative page. */
export function devicesAt(slug: string | undefined): Devices {
  return (slug !== undefined && NARRATIVE_PAGES.get(slug)) || {}
}

/** Whether an address is a narrative page's, where the bar tracks the reader (§3.1). */
export function isNarrativePath(pathname: string | null): boolean {
  return pathname !== null && NARRATIVE_PATHS.has(pathname)
}

/**
 * The attribute a Journal article carries when the bar may track its reader (§3.1): every
 * article but one that leads to counselling, which is a counselling surface and carries no
 * device (§2, principle 6; src/lib/journal/doors.ts). The header's bar is drawn on an article's
 * address only while the page holds an element with it, so the page decides, the header follows
 * it on every navigation, and a browser that cannot tell draws no bar.
 */
export const READING_BAR_ATTRIBUTE = 'data-reading-bar'

/** Whether an address is a Journal article's, where the bar may track the reader (§3.1). */
export function isArticlePath(pathname: string | null): boolean {
  const slug = pathname?.match(/^\/journal\/([^/]+)$/)?.[1]
  return slug !== undefined && isArticleSlug(slug)
}
