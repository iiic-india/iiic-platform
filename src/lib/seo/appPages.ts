/**
 * The search title and description of the pages the app draws itself, outside the CMS and the
 * starter files. Find your path is navigational and indexable, not optimised (plan B, 12): its
 * name, and a line that says what it asks, with the institute's name and city (D-65).
 */
export const MAP_PAGE = {
  path: '/map',
  title: 'Find your path',
  description:
    'One question from the Indian Institute of Image Catalysts (IIIC), Ahmedabad: who is this for? Yourself, your family or your organisation.',
} as const

/**
 * The Journal's list (docs/02): the title the keyword map gives it
 * (docs/content/keyword-map.md, "Proof, Journal, Map and the rest"), and a description of what
 * the Journal holds in the platform plan's own words ("articles applying the framework to
 * work, family and self", docs/00), with the institute's name and city (D-63, D-65).
 */
export const JOURNAL_PAGE = {
  path: '/journal',
  title: 'The Journal: Subjective Self in work and family',
  description:
    'Articles from the Indian Institute of Image Catalysts (IIIC), Ahmedabad, applying Subjective Self to work, family and the self.',
} as const

/**
 * Proof (docs/02): the title the keyword map gives it (docs/content/keyword-map.md, "Proof,
 * Journal, Map and the rest"), and a description of what it holds by the rule every review on
 * it keeps (D-37), with the institute's name and city (D-63, D-65). It names no count and no
 * outcome; the keyword map's description comes once reviews are published (I-42).
 */
export const PROOF_PAGE = {
  path: '/proof',
  title: 'IIIC reviews: Gaurang Mistry’s programmes',
  description:
    'Reviews of Gaurang Mistry’s programmes, each published with its writer’s permission, from the Indian Institute of Image Catalysts (IIIC), Ahmedabad.',
} as const

/** Every such page, for the sitemap and llms.txt. */
export const APP_PAGES = [MAP_PAGE, JOURNAL_PAGE, PROOF_PAGE] as const
