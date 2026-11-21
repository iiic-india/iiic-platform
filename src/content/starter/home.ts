import type { PageContent } from '@/lib/content/types'

/**
 * The home page as docs/content/copy-architecture.md §4.1 lays it out, for the time before the
 * page exists in the CMS (D-51). The labels are the copy architecture's:
 * - [IIIC]: IIIC's own words, verbatim from docs/content/sources/ (tests hold them to the sources);
 * - [CS]: a candidate line from the copy system, shown with a marker until IIIC approves it (I-41);
 * - [proposal] lines and unsupplied facts are placeholders, never written here.
 * Section 3's two Object/Subject pairs come with the flip (docs/11 §3.2, §4); until then the
 * section links to all five on /framework. "In their words", the voices beside the sections and
 * the Journal teaser join the page with the reviews and the Journal.
 */

/** IIIC's own lines on this page, exactly as the sources have them. */
export const HOME_IIIC_LINES = {
  counselling: 'Counselling transforms how people perceive, interpret and understand.',
  consultancy: 'Business & Management Consultancy transforms how people lead, organise and build.',
  education: 'Education transforms how people learn, think and act.',
  framework:
    "Subjective Self is a psychological framework that encourages individuals to look at themselves as a subject rather than merely as an object of their circumstances. It focuses on understanding oneself, examining one's thought processes, recognising one's role in different situations and taking ownership of one's decisions and actions.",
  years: '25 years of research, application, and refinement',
} as const

const FIND_YOUR_PATH = { label: 'Find your path', href: '/map' }

export const HOME: PageContent = {
  // The page's name in the admin only: the home page's tab title is the site's fixed one, set in
  // the platform layout (docs/12 §3). Search terms (D-65): Indian Institute of Image Catalysts,
  // IIIC Ahmedabad, image catalysts Ahmedabad, IIIC Subjective Self.
  title: 'Home',
  slug: 'home',
  description:
    'Indian Institute of Image Catalysts (IIIC), Ahmedabad: business & management consultancy, a certification course and counselling, built on Subjective Self.',
  layout: [
    {
      blockType: 'hero',
      kicker: 'Indian Institute of Image Catalysts',
      // [CS]
      heading: 'Know Yourself. Every Answer Follows.',
      // [CS, changed]
      lead: "Subjective Self, India's indigenous framework of psychology, applied to your life, your leadership and your learning.",
      primary: FIND_YOUR_PATH,
      secondary: { label: 'Discover Subjective Self', href: '/framework' },
      copyStatus: 'candidate',
    },
    {
      blockType: 'doors',
      // [CS]
      heading: 'Which question brought you here?',
      doors: [
        {
          glyph: 'C',
          audience: 'For individuals and families',
          href: '/counselling',
          // [CS]
          question: 'I want to understand myself.',
          line: HOME_IIIC_LINES.counselling,
          outcomes: 'Perspective · Acceptance · Growth',
        },
        {
          glyph: 'O',
          audience: 'For organisations',
          href: '/organisations',
          // [CS]
          question: 'I want to lead with clarity and grow my business.',
          line: HOME_IIIC_LINES.consultancy,
          outcomes: 'Leadership · Systems · Culture',
        },
        {
          glyph: 'L',
          audience: 'For learners',
          href: '/learn',
          // [CS]
          question: 'I want to build my image and presence from within.',
          line: HOME_IIIC_LINES.education,
          outcomes: 'Discipline · Accountability · Decisiveness',
        },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'statement',
      // [CS]
      heading: 'One framework at the heart of it all',
      paragraphs: [
        // [CS]
        {
          text: 'Most of life happens to us. Subjective Self teaches you to live it as the subject.',
        },
        { text: HOME_IIIC_LINES.framework },
      ],
      action: { label: 'Discover Subjective Self', href: '/framework' },
      copyStatus: 'candidate',
    },
    {
      blockType: 'steps',
      // [CS]
      heading: 'How Subjective Self works',
      steps: [{ title: 'Observe' }, { title: 'Understand' }, { title: 'Choose' }, { title: 'Own' }],
      copyStatus: 'candidate',
    },
    {
      blockType: 'factList',
      // [CS]
      heading: 'Why IIIC',
      facts: [
        { statement: HOME_IIIC_LINES.years, source: "IIIC's brochure, on its curriculum" },
        {
          statement:
            '[[TODO: approval of the line on the Shrimad Bhagavad Gita, psychology and sociology, I-41]]',
        },
        {
          statement:
            "[[TODO: a counted number, organisations worked with or workshops delivered, with the count's basis, I-38]]",
        },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'founderNote',
      // [CS]
      heading: 'A word from the founder',
      note: '[[TODO: a short note in his own words, I-10]]',
      attribution: 'Gaurang Mistry, Founder',
      copyStatus: 'candidate',
    },
    {
      blockType: 'band',
      // [CS]
      heading: 'Your Answers Live Within You. We Help You Find Them.',
      sanskrit: 'आत्मानं विद्धि',
      translation: 'Know thyself',
      primary: FIND_YOUR_PATH,
      copyStatus: 'candidate',
    },
  ],
  facts: [
    { statement: HOME_IIIC_LINES.counselling, source: 'description', checkedAt: '2026-11-20' },
    { statement: HOME_IIIC_LINES.consultancy, source: 'description', checkedAt: '2026-11-20' },
    { statement: HOME_IIIC_LINES.education, source: 'description', checkedAt: '2026-11-20' },
    { statement: HOME_IIIC_LINES.framework, source: 'description', checkedAt: '2026-11-20' },
    { statement: HOME_IIIC_LINES.years, source: 'brochure', checkedAt: '2026-11-20' },
    // The hero's claim, in the founders' page's words: the page copy IIIC supplied
    // (docs/content/sources/founders-page-copy-2026-11-04.md).
    {
      statement: "India's indigenous framework of psychology",
      source: 'pageCopy',
      checkedAt: '2026-11-21',
    },
  ],
}
