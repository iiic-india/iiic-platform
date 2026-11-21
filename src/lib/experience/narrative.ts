import { pagePath } from '@/lib/content/slug'

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
}

/**
 * By slug. The home page flips a comparison once it carries one: its two pairs wait on IIIC's
 * choice (docs/11 §3.2; I-41).
 */
const NARRATIVE_PAGES: ReadonlyMap<string, Devices> = new Map([
  ['home', { flip: true }],
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
