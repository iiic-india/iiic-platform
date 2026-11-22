import type { PageContent } from '@/lib/content/types'

import { ABOUT, ABOUT_IIIC_LINES } from './about'
import {
  CONSULTANCY_OFFER_PAGES,
  SERVICE_IIIC_LINES,
  TEAM_MAP_IIIC_LINES,
  TEAM_MAP_PAGE,
} from './consultancyOffers'
import { COUNSELLING, COUNSELLING_IIIC_LINES } from './counselling'
import { FOUNDERS, FOUNDERS_IIIC_LINES } from './founders'
import { FRAMEWORK, FRAMEWORK_IIIC_LINES } from './framework'
import { HOME, HOME_IIIC_LINES } from './home'
import { INSTITUTE, INSTITUTE_IIIC_LINES } from './institute'
import { LEARN, LEARN_IIIC_LINES } from './learn'
import { ACCESSIBILITY, LEGAL_PAGES } from './legal'
import { ORGANISATIONS, ORGANISATIONS_IIIC_LINES } from './organisations'

/**
 * The starter pages, by slug. A route shows its starter page until a page at its address is
 * first published in the CMS, and from then on that page only, for as long as it exists
 * (D-51, D-57). They are IIIC's copy as the copy architecture lays it out, not seed data:
 * nothing here is made up. Look up a slug that comes from a request with starterAt: indexing
 * this map would also find what every object inherits, such as "constructor".
 */
export const STARTER_PAGES: Readonly<Record<string, PageContent>> = {
  [HOME.slug]: HOME,
  [FRAMEWORK.slug]: FRAMEWORK,
  [ORGANISATIONS.slug]: ORGANISATIONS,
  ...Object.fromEntries(CONSULTANCY_OFFER_PAGES.map((page) => [page.slug, page])),
  [FOUNDERS.slug]: FOUNDERS,
  [COUNSELLING.slug]: COUNSELLING,
  [LEARN.slug]: LEARN,
  [ABOUT.slug]: ABOUT,
  [INSTITUTE.slug]: INSTITUTE,
  ...Object.fromEntries(LEGAL_PAGES.map((page) => [page.slug, page])),
  [ACCESSIBILITY.slug]: ACCESSIBILITY,
}

/** The starter page at a slug. An own-property lookup, so "constructor" finds nothing. */
export function starterAt(slug: string): PageContent | undefined {
  return Object.hasOwn(STARTER_PAGES, slug) ? STARTER_PAGES[slug] : undefined
}

/** Every line the starter pages call IIIC's own, by page; tests hold them to the sources. */
export const STARTER_IIIC_LINES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  [HOME.slug]: HOME_IIIC_LINES,
  [FRAMEWORK.slug]: FRAMEWORK_IIIC_LINES,
  [ORGANISATIONS.slug]: ORGANISATIONS_IIIC_LINES,
  ...Object.fromEntries(
    CONSULTANCY_OFFER_PAGES.map((page) => [
      page.slug,
      page === TEAM_MAP_PAGE ? TEAM_MAP_IIIC_LINES : SERVICE_IIIC_LINES,
    ]),
  ),
  [FOUNDERS.slug]: FOUNDERS_IIIC_LINES,
  [COUNSELLING.slug]: COUNSELLING_IIIC_LINES,
  [LEARN.slug]: LEARN_IIIC_LINES,
  [ABOUT.slug]: ABOUT_IIIC_LINES,
  [INSTITUTE.slug]: INSTITUTE_IIIC_LINES,
}
