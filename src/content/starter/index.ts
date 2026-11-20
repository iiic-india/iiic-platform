import type { PageContent } from '@/lib/content/types'

import { HOME } from './home'

/**
 * The starter pages, by slug. A route shows its starter page until the page is published in
 * the CMS, and the CMS page from then on (D-51). They are IIIC's copy as the copy
 * architecture lays it out, not seed data: nothing here is made up.
 */
export const STARTER_PAGES: Readonly<Record<string, PageContent>> = {
  [HOME.slug]: HOME,
}
