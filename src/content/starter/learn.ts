import type { PageContent } from '@/lib/content/types'

/**
 * The learn page as docs/content/copy-architecture.md §4.6 lays it out, for the time before
 * the page exists in the CMS (D-51). Labels as in home.ts: [IIIC] lines are word for word
 * from docs/content/sources/, [CS] lines are candidates (I-41), and what nobody has supplied
 * is a placeholder. The course is never called a degree or diploma, and the certificate's
 * fixed statement is on the page (docs/08 §7). The proof section and the voices beside
 * sections 3 and 6 join the page with the reviews (D-58).
 */

/** IIIC's own lines on this page, exactly as the sources have them. */
export const LEARN_IIIC_LINES = {
  lead: 'At IIIC, we believe education should go beyond academic knowledge, conventional learning and preparing individuals to become part of an existing system.',
  understand: 'Through the Subjective Self framework, we help individuals understand:',
  purpose: 'Why they exist beyond simply fulfilling societal expectations.',
  identity: 'Why developing their individual identity and building their image matters.',
  significance:
    'Why they are important as individuals and what value they can contribute to society.',
  logic:
    'The reasoning behind their choices, actions and responsibilities, rather than simply following instructions.',
  accountability: 'How to take ownership of their development, decisions and actions.',
  awareness: 'It is not age based. It is awareness based.',
  why: "We don't just tell individuals what to do; we help them understand why they should do it.",
  objective:
    'Our objective is to make education a process of personal transformation rather than merely academic learning.',
} as const

const LINES = LEARN_IIIC_LINES
const INFO_SESSION = { label: 'Join a free info session', href: '/book/info' }
const PARTNER = { label: 'Partner with IIIC', href: '/institute' }
/** IIIC's workshop at a university, as its site records it (docs/09). */
export const PDEU_WORKSHOP =
  'Subjective Self: a two-day workshop on self-knowledge, Pandit Deendayal Energy University, 3–4 April 2023.'

export const LEARN: PageContent = {
  // Search terms (D-65): Subjective Self certification course, Subjective Self course, life skills
  // course, self-awareness course. Never degree, diploma or recognition words (docs/08 §7); the
  // three life skills are the philosophy's (docs/09). No source says where the course is held
  // (D-07, I-08, I-14), so the title names no city and "Ahmedabad" in the description is where
  // IIIC is, not where the course runs.
  title: 'Subjective Self certification course',
  slug: 'learn',
  description:
    'The Subjective Self certification course from IIIC, Ahmedabad: three life skills, discipline, accountability and decisiveness.',
  layout: [
    {
      blockType: 'hero',
      kicker: 'For learners',
      // [CS]
      heading: 'Education That Teaches the Why.',
      lead: LINES.lead,
      primary: INFO_SESSION,
      secondary: PARTNER,
      copyStatus: 'candidate',
    },
    {
      blockType: 'statement',
      // [CS], heading and questions
      heading: 'The questions every growing mind carries',
      paragraphs: [
        {
          text: 'Who am I becoming? How do people experience me when I walk into a room? Am I making the wisest choices for my life?',
        },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'cards',
      // The section's name is the copy architecture's; each card is IIIC's own sentence, after
      // IIIC's own line that opens the list.
      heading: 'The five pillars',
      intro: LINES.understand,
      cards: [
        { title: 'Purpose', text: LINES.purpose },
        { title: 'Identity', text: LINES.identity },
        { title: 'Significance', text: LINES.significance },
        { title: 'Logic', text: LINES.logic },
        { title: 'Accountability', text: LINES.accountability },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'statement',
      // The section's name is the copy architecture's.
      heading: 'The Subjective Self certification course',
      paragraphs: [
        { text: '[[TODO: format, length, dates, curriculum and completion rule, I-14]]' },
        { text: LINES.awareness },
      ],
      copyStatus: 'candidate',
    },
    { blockType: 'certificate' },
    {
      blockType: 'statement',
      // The section's name is the copy architecture's.
      heading: 'Info session',
      paragraphs: [{ text: '[[TODO: dates, length, format and what is covered, I-13]]' }],
      action: INFO_SESSION,
      copyStatus: 'candidate',
    },
    {
      blockType: 'statement',
      // The section's name is the copy architecture's.
      heading: 'For colleges, universities and institutions',
      paragraphs: [
        { text: '[[TODO: the programmes for academic institutes, as IIIC confirms them, I-11]]' },
        { text: PDEU_WORKSHOP },
      ],
      action: PARTNER,
      copyStatus: 'candidate',
    },
    {
      blockType: 'statement',
      // The section's name is the copy architecture's; both lines are IIIC's own.
      heading: 'Our philosophy',
      paragraphs: [{ text: LINES.why }, { text: LINES.objective }],
      copyStatus: 'candidate',
    },
    {
      blockType: 'band',
      // The outcome band: IIIC's three life skills.
      kicker: 'Discipline · Accountability · Decisiveness',
      // [CS]
      heading: 'Develop the Human. The Achiever Follows.',
      sanskrit: 'आत्मानं विद्धि',
      translation: 'Know thyself',
      primary: INFO_SESSION,
      copyStatus: 'candidate',
    },
  ],
  facts: [
    { statement: LINES.lead, source: 'description', checkedAt: '2026-11-21' },
    { statement: LINES.understand, source: 'description', checkedAt: '2026-11-21' },
    { statement: LINES.purpose, source: 'description', checkedAt: '2026-11-21' },
    { statement: LINES.identity, source: 'description', checkedAt: '2026-11-21' },
    { statement: LINES.significance, source: 'description', checkedAt: '2026-11-21' },
    { statement: LINES.logic, source: 'description', checkedAt: '2026-11-21' },
    { statement: LINES.accountability, source: 'description', checkedAt: '2026-11-21' },
    { statement: LINES.awareness, source: 'brochure', checkedAt: '2026-11-21' },
    { statement: LINES.why, source: 'description', checkedAt: '2026-11-21' },
    { statement: LINES.objective, source: 'description', checkedAt: '2026-11-21' },
    { statement: PDEU_WORKSHOP, source: 'site', checkedAt: '2026-11-21' },
  ],
}
