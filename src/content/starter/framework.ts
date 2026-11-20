import type { PageContent } from '@/lib/content/types'

/**
 * The framework page as docs/content/copy-architecture.md §4.2 lays it out, for the time
 * before the page exists in the CMS (D-51). Labels as in home.ts: [IIIC] lines are word for
 * word from docs/content/sources/, [CS] lines are candidates (I-41), and what nobody has
 * supplied is a placeholder. The comparison is the plain two-column view; the flip
 * (docs/11 §3.2) and the voices beside sections 2, 3 and 7 come with the experience devices
 * and the reviews.
 */

/** IIIC's own lines on this page, exactly as the sources have them. */
export const FRAMEWORK_IIIC_LINES = {
  sentence:
    'Subjective Self is a psychological framework that encourages individuals to look at themselves as a subject rather than merely as an object of their circumstances.',
  aim: 'The aim is not motivation, but mental clarity.',
  gita: 'concepts of self through Shrimad Bhagwat Gita, Psychology & Sociology',
  society:
    'how the Indian society understands self in connection with their society, family values, patterns of thoughts, values of emotions, and environmental factors and benefits',
  whoFor:
    'Entrepreneurs, business owners, coaches, consultants, professionals, homemakers, or anyone who wants to live by conscious choice rather than emotional reaction.',
  awareness: 'It is not age based. It is awareness based.',
  move: 'Participants move from reacting to observing and responding.',
  decisions: 'Take decisions with clear purpose',
  reasoning: 'Use logical reasoning over emotional impulse',
  discipline: 'Build discipline, accountability, and decisiveness',
  trueSelf: 'Recognize their true self beyond external influence',
  goals: 'Align personal and professional goals',
  foundation: 'The common philosophical foundation connecting all three service verticals',
  education: 'Awareness, Mindset & Life Skills',
  business: 'Leadership, Systems & Culture',
  counselling: 'Perspective, Acceptance & Growth',
  path: 'Awareness → Mindset Shift → Informed Action → Sustainable Growth',
  centre:
    'At IIIC, the individual is not merely a participant in the process of transformation. The individual is at the centre of the transformation itself.',
} as const

const LINES = FRAMEWORK_IIIC_LINES

export const FRAMEWORK: PageContent = {
  title: 'Framework',
  slug: 'framework',
  layout: [
    {
      blockType: 'hero',
      kicker: 'Subjective Self',
      // [CS]
      heading: 'You Are the Subject of Your Life.',
      lead: LINES.sentence,
      primary: { label: 'Find your path', href: '/map' },
      copyStatus: 'candidate',
    },
    {
      blockType: 'statement',
      // [CS]
      heading: 'What is Subjective Self?',
      paragraphs: [
        // [CS]
        {
          text: 'Most people live as the object of their circumstances. Events happen, and they react.',
        },
        // [CS]
        {
          text: 'Subjective Self invites you to live as the subject. You observe your thoughts, understand your emotions, recognise your role in every situation and take ownership of your choices. Your circumstances stay the same. Your relationship with them changes completely.',
        },
        { text: LINES.aim },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'comparison',
      // [CS], heading and pairs
      heading: 'Object or subject?',
      leftLabel: 'Living as the object',
      rightLabel: 'Living as the subject',
      pairs: [
        { left: 'Life happens to me', right: 'I shape how I meet life' },
        { left: 'I react to people and events', right: 'I observe, then respond' },
        { left: 'Others decide my worth', right: 'I know my worth' },
        { left: 'I follow instructions', right: 'I understand the reason behind them' },
        { left: 'Circumstances drive my choices', right: 'Clarity drives my choices' },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'steps',
      // [CS], heading and pillars
      heading: 'The four pillars',
      steps: [
        {
          title: 'Know the Self',
          text: 'Understand who you are beyond roles and expectations.',
        },
        {
          title: 'Examine the Thought',
          text: 'See how your thoughts form and shape your actions.',
        },
        {
          title: 'Recognise Your Role',
          text: 'See your part in every situation with honesty.',
        },
        {
          title: 'Own the Choice',
          text: 'Take accountability for your decisions and their outcomes.',
        },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'factList',
      // The section's name is the copy architecture's.
      heading: 'Where it comes from',
      facts: [
        { statement: `“${LINES.gita}”`, source: "IIIC's brochure, on its curriculum" },
        { statement: `“${LINES.society}”`, source: "IIIC's website" },
        {
          statement: "[[TODO: the founder's work, as he wants it described, I-10]]",
        },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'statement',
      // [CS]
      heading: 'Who is it for?',
      paragraphs: [{ text: LINES.whoFor }, { text: LINES.awareness }],
      copyStatus: 'candidate',
    },
    {
      blockType: 'points',
      // [CS]
      heading: 'What changes',
      lead: LINES.move,
      points: [
        { text: LINES.decisions },
        { text: LINES.reasoning },
        { text: LINES.discipline },
        { text: LINES.trueSelf },
        { text: LINES.goals },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'doors',
      // [CS]
      heading: 'One framework, three applications',
      intro: LINES.foundation,
      // The order of IIIC's own diagram (philosophy, 19 November 2026).
      doors: [
        {
          glyph: 'L',
          href: '/learn',
          question: 'Education',
          line: LINES.education,
          action: 'Learn',
        },
        {
          glyph: 'O',
          href: '/organisations',
          question: 'Business & Management',
          line: LINES.business,
          action: 'For organisations',
        },
        {
          glyph: 'C',
          href: '/counselling',
          question: 'Counselling',
          line: LINES.counselling,
          action: 'Counselling',
        },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'statement',
      // IIIC's own heading from its diagram, and IIIC's own lines.
      heading: 'Human transformation',
      paragraphs: [{ text: LINES.path }, { text: LINES.centre }],
      copyStatus: 'approved',
    },
    {
      blockType: 'band',
      // [CS]
      heading: 'Begin with the Self.',
      sanskrit: 'आत्मानं विद्धि',
      translation: 'Know thyself',
      primary: { label: 'Find your path', href: '/map' },
      copyStatus: 'candidate',
    },
  ],
  facts: [
    { statement: LINES.sentence, source: 'description', checkedAt: '2026-11-20' },
    { statement: LINES.aim, source: 'brochure', checkedAt: '2026-11-20' },
    { statement: LINES.gita, source: 'brochure', checkedAt: '2026-11-20' },
    { statement: LINES.society, source: 'site', checkedAt: '2026-11-20' },
    { statement: LINES.whoFor, source: 'brochure', checkedAt: '2026-11-20' },
    { statement: LINES.awareness, source: 'brochure', checkedAt: '2026-11-20' },
    { statement: LINES.move, source: 'brochure', checkedAt: '2026-11-20' },
    { statement: LINES.foundation, source: 'description', checkedAt: '2026-11-20' },
    { statement: LINES.path, source: 'description', checkedAt: '2026-11-20' },
    { statement: LINES.centre, source: 'description', checkedAt: '2026-11-20' },
  ],
}
