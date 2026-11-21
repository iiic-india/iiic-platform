import type { PageContent } from '@/lib/content/types'

import { PDEU_WORKSHOP } from './learn'

/**
 * The About page as docs/content/copy-architecture.md §4.9 lays it out, for the time before
 * the page exists in the CMS (D-51). Labels as in home.ts: [IIIC] lines are word for word
 * from docs/content/sources/, and what nobody has supplied is a placeholder.
 *
 * Three things wait, and the page says so instead of guessing: the headline "25 years of
 * understanding the human mind" is used only if the founder settles the years on 25 (I-32),
 * so the institute's name stands in its place; the first sentence of "The Larger Vision"
 * names IIIC "First" and waits on evidence and a lawyer's view (I-31), so the section opens
 * with its second, and its heading drops the subtitle, which names IIIC "First" too; and the
 * brochure's biography is used without its guarantee and without its sentence on AnkVishwa,
 * which gives way to one line in the founder's own words (D-26, I-10). The vision does not
 * repeat the lines the home and framework pages carry (copy architecture §4.9).
 * The contact form joins the contact section with the enquiry flow (D-58).
 */

/**
 * IIIC's own lines on this page, word for word from the sources (the vision's heading without
 * its subtitle, I-31).
 */
export const ABOUT_IIIC_LINES = {
  opening:
    'The Indian Institute of Image Catalysts (IIIC) operates across three distinct service verticals: Education, Counselling, and Business & Management Consultancy. While each vertical addresses a different domain of human engagement, all three are interconnected through a common philosophy - the Subjective Self Framework.',
  visionHeading: 'The Larger Vision',
  purpose:
    'The three services may operate in different environments, but their underlying purpose remains the same: to help individuals understand themselves, expand their perspectives, transform their mindsets and become more conscious participants in their personal and professional lives.',
  progress:
    'Ultimately, we believe that individual transformation is the starting point of collective progress. When people evolve, the systems they create, the organisations they lead and the environments they influence evolve alongside them.',
  founder:
    'Mr. Gaurang Mistry, Image Consultant and founder of IIIC-Indian Institute of Image Catalysts is a student, researcher and follower of psychology inspired by sociology. He has extensively utilised his knowledge and expertise in the areas of Human Resource planning, Human Excellence, Business & Marketing Strategies & Consultation for 3 decades.',
  research:
    'His research is based on Concepts of Self through Bhagwad Gita and the Concepts in Indian Culture.',
} as const

const LINES = ABOUT_IIIC_LINES
const CONTACT = { label: 'Contact', href: '/about#contact' }
const PARTNER = { label: 'Partner with IIIC', href: '/institute' }
/** IIIC's public workshop, as its site records it (docs/09). */
export const PUBLIC_WORKSHOP =
  'Subjective Self: a public workshop, Cafe Venture Studio, Commerce Six Roads, Ahmedabad, 8–9 July 2023.'

export const ABOUT: PageContent = {
  title: 'About',
  slug: 'about',
  layout: [
    {
      blockType: 'hero',
      kicker: 'About',
      // The institute's name, until the headline has its years (I-32).
      heading: 'Indian Institute of Image Catalysts',
      lead: LINES.opening,
      primary: CONTACT,
      note: '[[TODO: the headline, once the years have one wording, I-32]]',
      copyStatus: 'approved',
    },
    {
      blockType: 'statement',
      // IIIC's own section, from its second sentence on (I-31).
      heading: LINES.visionHeading,
      paragraphs: [{ text: LINES.purpose }, { text: LINES.progress }],
      copyStatus: 'approved',
    },
    {
      blockType: 'founderNote',
      // The section's name is the copy architecture's; the biography is the brochure's.
      kicker: 'The founder',
      heading: 'Gaurang Mistry',
      note: [
        LINES.founder,
        LINES.research,
        '[[TODO: one factual line about Ankvishwa, in his own words, I-10]]',
      ].join('\n'),
      copyStatus: 'candidate',
    },
    {
      blockType: 'statement',
      // The section's name is the copy architecture's.
      heading: 'The team',
      paragraphs: [
        {
          text: '[[TODO: who delivers sessions at launch, with names, photographs and credentials as on their certificates, I-09]]',
        },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'statement',
      // The section's name is the copy architecture's; the two workshops are on IIIC's site.
      heading: 'Institutional work',
      paragraphs: [
        { text: PDEU_WORKSHOP },
        { text: PUBLIC_WORKSHOP },
        {
          text: '[[TODO: the organisations IIIC has worked with, once the founder confirms the list, I-38]]',
        },
      ],
      action: PARTNER,
      copyStatus: 'candidate',
    },
    { blockType: 'contact' },
  ],
  facts: [
    { statement: LINES.opening, source: 'description', checkedAt: '2026-11-21' },
    { statement: LINES.purpose, source: 'description', checkedAt: '2026-11-21' },
    { statement: LINES.progress, source: 'description', checkedAt: '2026-11-21' },
    { statement: LINES.founder, source: 'brochure', checkedAt: '2026-11-21' },
    { statement: LINES.research, source: 'brochure', checkedAt: '2026-11-21' },
    { statement: PDEU_WORKSHOP, source: 'site', checkedAt: '2026-11-21' },
    { statement: PUBLIC_WORKSHOP, source: 'site', checkedAt: '2026-11-21' },
  ],
}
