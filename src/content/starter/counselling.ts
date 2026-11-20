import type { PageContent } from '@/lib/content/types'

/**
 * The counselling page as docs/content/copy-architecture.md §4.5 lays it out, for the time
 * before the page exists in the CMS (D-51). Labels as in home.ts: [IIIC] lines are word for
 * word from docs/content/sources/, [CS] lines are candidates (I-41), and what nobody has
 * supplied is a placeholder.
 *
 * Counselling copy keeps to src/brand/VOICE.md: sessions are non-clinical conversations, and
 * the scope statement with the crisis numbers is on the page (docs/08 §7). The reviews
 * (section 3) join the page with the reviews; the copy system's card "A Space to Be Heard"
 * is left out until the lawyer has seen it (copy architecture §4.5, row 5).
 */

/** IIIC's own lines on this page, exactly as the sources have them. */
export const COUNSELLING_IIIC_LINES = {
  lead: 'Our counselling approach focuses on helping individuals gain clarity about themselves, their circumstances, emotions, thought processes and decisions.',
  how: 'Through counselling, IIIC uses the Subjective Self Framework to help individuals look beyond their immediate emotional lens and develop a broader understanding of their circumstances.',
} as const

const LINES = COUNSELLING_IIIC_LINES
const BOOK_A_SESSION = { label: 'Book a session', href: '/book/session' }

export const COUNSELLING: PageContent = {
  title: 'Counselling',
  slug: 'counselling',
  layout: [
    {
      blockType: 'hero',
      kicker: '[[TODO: the direction line, D-19]]',
      // [CS]
      heading: 'Be Heard. Be Understood. Know Yourself.',
      lead: LINES.lead,
      primary: BOOK_A_SESSION,
      // The pointer the copy architecture asks for, in place of a promise of confidentiality.
      secondary: {
        label: 'What that means, and what we keep private',
        href: '/counselling#scope',
      },
      note: 'Sessions are non-clinical conversations.',
      copyStatus: 'candidate',
    },
    {
      blockType: 'points',
      // [CS], heading and lines; none names a condition.
      heading: 'Does this feel familiar?',
      points: [
        { text: 'Everything looks fine, yet something feels empty inside.' },
        { text: 'The same thoughts return every night.' },
        { text: 'Small moments trigger big reactions.' },
        { text: 'You keep searching for answers outside yourself.' },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'steps',
      // [CS], heading and steps; "feel genuinely understood" is "feel understood" here.
      heading: 'How we work',
      lead: LINES.how,
      steps: [
        { title: 'We listen.', text: 'You speak freely and feel understood.' },
        {
          title: 'We explain.',
          text: 'Through Subjective Self, you see the logic behind your thoughts, emotions and decisions.',
        },
        {
          title: 'We equip.',
          text: 'You leave with practical solutions and the ability to think, decide and act independently.',
        },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'cards',
      // [CS], heading and cards.
      heading: 'What you gain',
      cards: [
        { title: 'Understanding the Self', text: 'What the self is, and how it shapes your life' },
        { title: 'Logical Answers', text: 'Clear reasons for what you feel' },
        { title: 'Practical Solutions', text: 'Tools for home, relationships and work' },
        { title: 'Emotional Awareness', text: 'Observe, understand, then respond' },
        { title: 'Personal Accountability', text: 'Ownership of your choices and your growth' },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'statement',
      // [CS, changed]
      heading: 'Who it helps',
      paragraphs: [
        {
          text: 'Individuals, families and young adults facing questions of identity, relationships, stress, life transitions and decisions.',
        },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'points',
      // The section's name is the copy architecture's; the facts are IIIC's form and decisions.
      heading: 'Sessions and how booking works',
      points: [
        // IIIC's registration form (docs/09).
        { text: '1:1 sessions of 15, 30 or 45 minutes.' },
        { text: 'Family sessions: [[TODO: their length, I-31]]' },
        { text: '[[TODO: online, at the office or both, for each kind of session, I-08]]' },
        // D-02, in the kit's own words for it.
        { text: 'Pick a free time, or ask for another.' },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'statement',
      // The section's name is the copy architecture's.
      heading: 'Who you will meet',
      paragraphs: [
        {
          text: '[[TODO: the counsellors, with their credentials exactly as on their certificates, I-09]]',
        },
      ],
      copyStatus: 'candidate',
    },
    { blockType: 'scope' },
    {
      blockType: 'statement',
      heading: 'Questions people ask',
      paragraphs: [
        { text: "[[TODO: the questions people ask about counselling, with IIIC's answers, I-20]]" },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'band',
      // The outcome band, from IIIC's diagram.
      kicker: 'Perspective · Acceptance · Growth',
      // [CS]
      heading: 'Understand Yourself. Then Life Begins to Make Sense.',
      sanskrit: 'आत्मानं विद्धि',
      translation: 'Know thyself',
      primary: BOOK_A_SESSION,
      copyStatus: 'candidate',
    },
  ],
  facts: [
    { statement: LINES.lead, source: 'description', checkedAt: '2026-11-21' },
    { statement: LINES.how, source: 'description', checkedAt: '2026-11-21' },
    { statement: '1:1 sessions of 15, 30 or 45 minutes.', source: 'site', checkedAt: '2026-11-21' },
  ],
}
