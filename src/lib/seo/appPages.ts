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

/** Every such page, for the sitemap and llms.txt. */
export const APP_PAGES = [MAP_PAGE] as const
