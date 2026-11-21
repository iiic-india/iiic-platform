import type { PageContent } from '@/lib/content/types'

import { FOUNDERS_IIIC_LINES, FOUNDERS_STORY_ANCHOR, FOUNDERS_STORY_LABEL } from './founders'

/**
 * The page for organisations as docs/content/copy-architecture.md §4.4 lays it out, for the
 * time before the page exists in the CMS (D-51). Labels as in home.ts: [IIIC] lines are word
 * for word from docs/content/sources/, [CS] lines are candidates (I-41), and what nobody has
 * supplied is a placeholder. Section 3 is a way to the founders' story, which is told once,
 * on its own page (D-28); the proof section and the voices beside sections 2, 4 and 5 join
 * the page with the reviews.
 */

/** IIIC's own lines on this page, exactly as the sources have them. */
export const ORGANISATIONS_IIIC_LINES = {
  lead: 'We work with business owners, entrepreneurs, leaders and professionals through insightful mentorship rooted in the Subjective Self framework.',
  beyond:
    'At IIIC, business consultancy goes beyond conventional business advice and management solutions.',
  growth:
    "We believe that an organisation's growth is closely connected to the evolution of its leadership. When a founder evolves in their thinking, perspective and approach, the organisation has the opportunity to evolve alongside them.",
  systems:
    'Alongside leadership development, we build organisational systems, processes and Standard Operating Procedures (SOPs) through an HR-centric approach.',
  people:
    'Developing individuals who understand ownership, accountability, leadership and organisational purpose.',
  processes:
    'Building structured systems and operating procedures that bring consistency, clarity and efficiency to business operations.',
  culture:
    'Creating a shared organisational mindset that becomes part of everyday functioning and is sustained by the people within the company.',
  sustainable:
    "We don't just build businesses; we build the people, systems and cultures that make businesses sustainable.",
} as const

const LINES = ORGANISATIONS_IIIC_LINES
// /book/call opens with the booking flow (M3) and /organisations/team-map with the Team Map page;
// until then both lead to the 404 (NOT_BUILT_YET in tests/unit/starterPages.spec.ts).
const BOOK_A_CALL = { label: 'Book a proposal call', href: '/book/call' }
/** What each service page will say, once IIIC supplies it (I-11). */
const SERVICE_COPY =
  '[[TODO: the problem it solves, how the framework applies, what a client receives, I-11]]'

export const ORGANISATIONS: PageContent = {
  title: 'For organisations',
  slug: 'organisations',
  layout: [
    {
      blockType: 'hero',
      kicker: 'For organisations',
      // [CS]
      heading: 'Your Business Grows as Far as Your Thinking Goes.',
      lead: LINES.lead,
      primary: BOOK_A_CALL,
      copyStatus: 'candidate',
    },
    {
      blockType: 'points',
      // [CS], heading and lines
      heading: 'Does this feel familiar?',
      points: [
        { text: 'Every decision still passes through your desk.' },
        { text: 'Growth has come, and so has the weight.' },
        { text: 'Your team waits for direction.' },
        { text: 'You know the next level calls for a different you.' },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'statement',
      // The story is IIIC's and lives on /founders; here its heading, its first line and a way in.
      kicker: FOUNDERS_STORY_LABEL,
      heading: FOUNDERS_IIIC_LINES.storyHeading,
      paragraphs: [{ text: FOUNDERS_IIIC_LINES.shed }],
      action: { label: 'Read the story', href: `/founders#${FOUNDERS_STORY_ANCHOR}` },
      copyStatus: 'candidate',
    },
    {
      blockType: 'statement',
      // [CS]
      heading: 'Beyond business advice',
      paragraphs: [
        // [CS]
        {
          text: "Conventional consultancy works on the business. IIIC works on the leader who runs it. When the leader's thinking becomes clear, strategy, systems and people follow.",
        },
        { text: LINES.beyond },
        { text: LINES.growth },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'cards',
      // The section's name is the copy architecture's.
      heading: 'What we work on',
      intro: LINES.systems,
      cards: [
        // IIIC's three organisational pillars, each with IIIC's sentence.
        { title: 'People', text: LINES.people },
        { title: 'Processes', text: LINES.processes },
        { title: 'Culture', text: LINES.culture },
        // The plan's three services, until IIIC settles the list (I-11).
        { title: 'Organisation planning', text: SERVICE_COPY },
        { title: 'Marketing and sales', text: SERVICE_COPY },
        { title: 'Brand positioning', text: SERVICE_COPY },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'statement',
      // The section's name is the copy architecture's.
      heading: 'The Team Map',
      paragraphs: [
        { text: '[[TODO: what happens, how long it takes, what the client gets, I-12]]' },
      ],
      action: { label: 'Request a Team Map', href: '/organisations/team-map' },
      copyStatus: 'candidate',
    },
    {
      blockType: 'statement',
      // [CS]
      heading: 'Who it is for',
      paragraphs: [
        {
          text: 'Business owners, founders, entrepreneurs, SME and MSME leaders, CXOs, HR leaders and professionals managing their own domain.',
        },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'band',
      // The outcome band, from IIIC's diagram.
      kicker: 'Leadership · Systems · Culture',
      // [CS]
      heading: 'Know the Founder. Then Grow the Empire.',
      lead: LINES.sustainable,
      sanskrit: 'आत्मानं विद्धि',
      translation: 'Know thyself',
      primary: BOOK_A_CALL,
      copyStatus: 'candidate',
    },
  ],
  facts: [
    { statement: LINES.lead, source: 'description', checkedAt: '2026-11-20' },
    { statement: LINES.beyond, source: 'description', checkedAt: '2026-11-20' },
    { statement: LINES.growth, source: 'description', checkedAt: '2026-11-20' },
    { statement: LINES.systems, source: 'description', checkedAt: '2026-11-20' },
    { statement: LINES.people, source: 'description', checkedAt: '2026-11-20' },
    { statement: LINES.processes, source: 'description', checkedAt: '2026-11-20' },
    { statement: LINES.culture, source: 'description', checkedAt: '2026-11-20' },
    { statement: LINES.sustainable, source: 'description', checkedAt: '2026-11-20' },
  ],
}
