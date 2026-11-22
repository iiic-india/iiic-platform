/**
 * The consultancy's offers, each with its page under /organisations (docs/02): the three services
 * docs/09 records from IIIC's brief and its current site, in the plan's words, until IIIC settles
 * the list and the names against its brochure (I-11), and the Team Map (docs/02; I-12). One list
 * for the organisations page's cards, the pages themselves and their structured data, so the
 * three never drift apart. Brand positioning is a consultancy service; it is never called image
 * consulting (docs/content/keyword-map.md).
 */
export type ConsultancyOffer = { slug: string; name: string }

export const CONSULTANCY_SERVICES: readonly ConsultancyOffer[] = [
  { slug: 'organisations/organisation-planning', name: 'Organisation planning' },
  { slug: 'organisations/marketing-and-sales', name: 'Marketing and sales' },
  { slug: 'organisations/brand-positioning', name: 'Brand positioning' },
]

export const TEAM_MAP: ConsultancyOffer = { slug: 'organisations/team-map', name: 'Team Map' }

/** The vertical, in IIIC's name for it (content/sources/iiic-philosophy-2026-11-19.md). */
export const CONSULTANCY_NAME = 'Business & Management Consultancy'

/**
 * Who the consultancy is for, in the words of the founders' page (docs/09: "founders, business
 * owners and SME/MSME leaders"), as the structured data names its audience (D-62).
 */
export const CONSULTANCY_AUDIENCE = 'Founders, business owners and SME/MSME leaders'
