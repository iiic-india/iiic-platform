import { FORM_ANCHORS } from '@/blocks/pageBlocks'
import type { PageContent } from '@/lib/content/types'
import {
  CONSULTANCY_NAME,
  CONSULTANCY_SERVICES,
  type ConsultancyOffer,
  TEAM_MAP,
} from '@/lib/site/consultancy'

import {
  BOOK_A_CALL,
  CONSULTANCY_BAND,
  ORGANISATIONS_IIIC_LINES,
  SERVICE_COPY,
} from './organisations'

/**
 * The pages under /organisations/ (docs/02): one landing page for each of the three services
 * docs/09 names, and the Team Map, for the time before each exists in the CMS (D-51). Each
 * follows the template of docs/content/copy-architecture.md §4.4: what the service is waits on
 * IIIC (I-11), and what the Team Map is on I-12, so those parts are placeholders; the rest is
 * IIIC's own words about the consultancy, from the organisations page. The services' names are
 * the plan's until IIIC settles the list (I-11), so the sections that carry them are candidates.
 * Each page's questions section shows what IIIC publishes for it in Content → FAQs, and nothing
 * until then. Search titles and descriptions follow docs/content/keyword-map.md (D-65).
 */

const LINES = ORGANISATIONS_IIIC_LINES

/** IIIC's own lines on the Team Map page, exactly as the sources have them. */
export const TEAM_MAP_IIIC_LINES = {
  beyond: LINES.beyond,
  systems: LINES.systems,
  sustainable: LINES.sustainable,
} as const

/** IIIC's own lines on each service's page: the Team Map page's, and the consultancy's lead. */
export const SERVICE_IIIC_LINES = { lead: LINES.lead, ...TEAM_MAP_IIIC_LINES } as const

/** The way back to the whole consultancy, on every page under /organisations/. */
const consultancySection = {
  blockType: 'statement',
  heading: CONSULTANCY_NAME,
  paragraphs: [{ text: LINES.beyond }, { text: LINES.systems }],
  action: { label: 'See the whole consultancy', href: '/organisations' },
  copyStatus: 'candidate',
} as const satisfies PageContent['layout'][number]

/** The questions section: drawn only once IIIC publishes a question for the page (I-20). */
const questions = {
  blockType: 'faq',
  heading: 'Questions people ask',
  copyStatus: 'candidate',
} as const satisfies PageContent['layout'][number]

const facts = (statements: readonly string[]): NonNullable<PageContent['facts']> =>
  statements.map((statement) => ({ statement, source: 'description', checkedAt: '2026-11-22' }))

/** A service's landing page: its name, what it covers (I-11), the consultancy, its questions. */
function servicePage(
  offer: ConsultancyOffer,
  search: { title: string; description: string },
): PageContent {
  return {
    ...search,
    slug: offer.slug,
    layout: [
      {
        blockType: 'hero',
        kicker: CONSULTANCY_NAME,
        heading: offer.name,
        lead: LINES.lead,
        primary: BOOK_A_CALL,
        copyStatus: 'candidate',
      },
      {
        blockType: 'statement',
        heading: `What ${offer.name.toLowerCase()} covers`,
        paragraphs: [{ text: SERVICE_COPY }],
        copyStatus: 'candidate',
      },
      consultancySection,
      questions,
      CONSULTANCY_BAND,
    ],
    facts: facts(Object.values(SERVICE_IIIC_LINES)),
  }
}

const [planning, marketing, brand] = CONSULTANCY_SERVICES as [
  ConsultancyOffer,
  ConsultancyOffer,
  ConsultancyOffer,
]

// Titles and descriptions as docs/content/keyword-map.md has them for these pages (D-65).
export const ORGANISATION_PLANNING = servicePage(planning, {
  title: 'Organisation planning consultancy for SMEs, Ahmedabad',
  description:
    'Organisation planning for small and mid-size businesses in Ahmedabad, part of IIIC’s Business & Management Consultancy, built on Subjective Self.',
})

export const MARKETING_AND_SALES = servicePage(marketing, {
  title: 'Marketing and sales consultancy for SMEs, Ahmedabad',
  description:
    'Marketing and sales consultancy for small and mid-size businesses in Ahmedabad, part of IIIC’s Business & Management Consultancy.',
})

// A consultancy service; never called image consulting (keyword-map.md).
export const BRAND_POSITIONING = servicePage(brand, {
  title: 'Brand positioning consultancy for SMEs, Ahmedabad',
  description:
    'Brand positioning for small and mid-size businesses in Ahmedabad, part of IIIC’s Business & Management Consultancy, built on Subjective Self.',
})

/** Where the Team Map is requested: the request form's own id (docs/17 §6). */
export const TEAM_MAP_REQUEST_ANCHOR = FORM_ANCHORS.teamMapRequest

/**
 * The Team Map (docs/02): what it is waits on IIIC (I-12). The request form (docs/03 F5;
 * docs/17 §6) stands where the hero's action leads, and shows its placeholder until the consent
 * text for replies to an enquiry is in force (I-22); the closing band books the proposal call,
 * as on every consultancy page.
 */
export const TEAM_MAP_PAGE: PageContent = {
  // keyword-map.md's title; its description waits on I-12, so this one says only what docs/09
  // holds: the consultancy, its place and its target.
  title: 'What a Team Map is, and how to request one',
  slug: TEAM_MAP.slug,
  description:
    'The Team Map, from IIIC’s Business & Management Consultancy in Ahmedabad, for founders and HR leads of small and mid-size businesses.',
  layout: [
    {
      blockType: 'hero',
      kicker: CONSULTANCY_NAME,
      // The section's name on the organisations page (copy architecture §4.4).
      heading: 'The Team Map',
      lead: '[[TODO: what happens, how long it takes, what the client gets, I-12]]',
      primary: {
        label: 'Request a Team Map',
        href: `/${TEAM_MAP.slug}#${TEAM_MAP_REQUEST_ANCHOR}`,
      },
      copyStatus: 'candidate',
    },
    { blockType: 'teamMapRequest' },

    consultancySection,
    questions,
    CONSULTANCY_BAND,
  ],
  facts: facts(Object.values(TEAM_MAP_IIIC_LINES)),
}

export const CONSULTANCY_OFFER_PAGES: readonly PageContent[] = [
  ORGANISATION_PLANNING,
  MARKETING_AND_SALES,
  BRAND_POSITIONING,
  TEAM_MAP_PAGE,
]
