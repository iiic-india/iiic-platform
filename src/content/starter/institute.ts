import type { PageContent } from '@/lib/content/types'

import { PDEU_WORKSHOP } from './learn'

/**
 * The institute page, for the time before the page exists in the CMS (D-51): the academic
 * pages that live at /institute until iiic.edu.in opens (docs/02; docs/00, "Institute
 * pages"). The copy architecture (§4.11) gives it the plan's wording and the known facts, and
 * the fixed statements of docs/08 §7: so the sections carry the plan's names, the one known
 * partnership is described exactly as it happened, the certificate's statement is on the
 * page, and everything IIIC has yet to supply is a placeholder.
 *
 * Certificate verification opens with the certificates (D-39, M5) and the partnership enquiry
 * with the pipeline (docs/03 F12, M4); until then the page leads to the contact details.
 */

/** IIIC's own line on this page, exactly as the source has it. */
export const INSTITUTE_IIIC_LINES = {
  education:
    'Through education, IIIC aims to create awareness and facilitate shifts in individual mindsets.',
} as const

const LINES = INSTITUTE_IIIC_LINES
const CONTACT = { label: 'Contact', href: '/about#contact' }

export const INSTITUTE: PageContent = {
  // Search terms (D-65): Subjective Self research, Subjective Self workshop (the 2023 workshop,
  // as a past fact). Workshops and programmes for colleges wait on I-11, so the title names what
  // the page holds, not an offer. The one partnership named is the one that happened (docs/09).
  title: 'Subjective Self research and university partnership',
  slug: 'institute',
  description:
    'IIIC, Ahmedabad: research, programmes and partnerships, including a two-day Subjective Self workshop at Pandit Deendayal Energy University in April 2023.',
  layout: [
    {
      blockType: 'hero',
      kicker: 'Institute',
      // The plan's own list of what the institute pages hold.
      heading: 'Research, programmes and partnerships',
      lead: LINES.education,
      primary: CONTACT,
      copyStatus: 'candidate',
    },
    {
      blockType: 'statement',
      // The section's name is the plan's.
      heading: 'Framework and research',
      paragraphs: [
        {
          text: '[[TODO: the methodology, and the papers, talks and research pieces, I-43]]',
        },
      ],
      action: { label: 'Read the framework', href: '/framework' },
      copyStatus: 'candidate',
    },
    {
      blockType: 'statement',
      // The section's name is the plan's.
      heading: 'Programmes',
      paragraphs: [
        {
          text: '[[TODO: syllabus, learning outcomes, assessment and certification standards, I-14]]',
        },
      ],
      action: { label: 'See the certification course', href: '/learn' },
      copyStatus: 'candidate',
    },
    { blockType: 'certificate' },
    {
      blockType: 'statement',
      // The section's name is the plan's; the workshop is on IIIC's site.
      heading: 'Partnerships',
      paragraphs: [{ text: PDEU_WORKSHOP }],
      action: CONTACT,
      copyStatus: 'candidate',
    },
    {
      blockType: 'statement',
      // The section's name is the plan's (docs/00, institute pages).
      heading: 'Faculty',
      paragraphs: [
        {
          text: '[[TODO: the founder’s and the faculty’s credentials, exactly as on their certificates, I-43]]',
        },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'statement',
      // The section's name is the plan's.
      heading: 'Verify a certificate',
      paragraphs: [
        {
          text: '[[TODO: certificate verification, which opens with the first certificates issued, D-39]]',
        },
      ],
      copyStatus: 'candidate',
    },
  ],
  facts: [
    { statement: LINES.education, source: 'description', checkedAt: '2026-11-21' },
    { statement: PDEU_WORKSHOP, source: 'site', checkedAt: '2026-11-21' },
  ],
}
