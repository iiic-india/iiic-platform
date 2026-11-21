import type { PageContent } from '@/lib/content/types'

/**
 * The founders' page, for the time before it exists in the CMS (D-51): the landing page
 * LinkedIn posts and referrals arrive on (docs/02). It is the one page whose whole copy IIIC
 * has supplied (docs/content/sources/founders-page-copy-2026-11-04.md), so every line here is
 * IIIC's, word for word, in the six sections IIIC wrote (copy architecture §4.3).
 *
 * What the page adds, and why (D-55):
 * - the story is labelled as IIIC's illustration: it names no client and is never shown as a
 *   client's story (D-28; src/brand/VOICE.md, the proof rule);
 * - "Built on Subjective Self" under the hero, the line the copy architecture puts there;
 * - a heading for the six insights, taken from IIIC's own section marker and marked as a
 *   candidate until IIIC confirms it (I-41);
 * - "Begin Your Journey" leads into the story, and "Book a Founder Consultation" books the
 *   proposal call until IIIC says what a Founder Consultation is (I-36).
 * The rupee figures are the turnover of the company in the story, not prices (D-21). The
 * chapter kickers, the voices beside the chapters and the reviews after them join the page
 * with the experience devices and the reviews (docs/11 §3.5; I-41, I-42).
 */

/** IIIC's own lines on this page, exactly as the source has them. */
export const FOUNDERS_IIIC_LINES = {
  headline: 'From ₹100 Crore to ₹1000 Crore, the Journey Begins Within',
  subheadline:
    'Your company has grown to the size of your thinking. Subjective Self helps founders expand the mind that leads the empire.',
  begin: 'Begin Your Journey',
  storyHeading: 'Every Empire Reaches a Turning Point',
  shed: "Twenty years ago, it began with a small shed, two machines and a loan co-signed by a father's trembling hands.",
  today:
    'Today, the company has crossed ₹100 crore. The team celebrates. The industry calls it a success story.',
  cabin: 'And the founder sits in his cabin with one question.',
  question: 'How do I take this to ₹1000 crore?',
  hands:
    'He already arrives first and leaves last. Every decision passes through his desk. Every problem finds its way to his phone. He has built an empire, and he holds it up with his own two hands.',
  chapter: 'The next chapter calls for a different founder.',
  shiftHeading: 'Founders Come for Strategy. They Leave with Clarity.',
  shift:
    "Subjective Self is India's indigenous framework of psychology, built on over 25 years of research. It helps founders examine the structure behind their own thinking, so every decision, system and relationship in the business rises from clarity.",
  empireTitle: 'The Empire',
  empire:
    "A company grows as large as its founder's mind allows. In the first chapter, the founder builds the business. In the next, he builds the people who build the business.",
  decisionsTitle: 'Decisions',
  decisions:
    'Choices once shaped by habit and old struggle now come from purpose. Slower in thought, faster in execution.',
  systemsTitle: 'Systems',
  systems:
    "A founder's true legacy is a structure that runs with clarity in his absence. Systems turn effort into scale.",
  peopleTitle: 'People',
  people:
    'Every person carries potential waiting for the right place and the right trust. The question shifts from "How much can they do?" to "What are they truly capable of?"',
  gratitudeTitle: 'Gratitude',
  gratitude:
    'Remembering the first loan, the loyal workers, the early clients. A grounded founder builds a stable empire.',
  brandTitle: 'Brand and Worth',
  brand:
    'A brand is the promise a company keeps every day, and that promise begins with the founder. Know your worth, and lead on value.',
  rhythmHeading: 'Same Company. A New Rhythm.',
  rhythm:
    'The factory, the team and the clients remain the same. Everything now moves differently.',
  ownership: 'Leaders take ownership.',
  load: 'Systems carry the load.',
  speaks: 'The brand speaks before the founder does.',
  space: 'And the founder finally has space to envision the next ₹900 crore.',
  closingHeading: 'Know the Founder. Then Grow the Empire.',
  consultation: 'Book a Founder Consultation',
  supporting: 'For founders, business owners and SME/MSME leaders ready for their next chapter.',
} as const

const LINES = FOUNDERS_IIIC_LINES

/** The story's link name: the hero's button opens it. */
export const FOUNDERS_STORY_ANCHOR = 'story'

/** What the story is, said above it (D-28). */
export const FOUNDERS_STORY_LABEL = 'IIIC’s illustration, not a client’s story'

/**
 * The amounts the story names: a company's turnover, in IIIC's words. Tests allow these on
 * this page and nothing else that looks like money (D-21).
 */
export const FOUNDERS_NARRATIVE_FIGURES = /₹(?:100|900|1000) [Cc]rore/g

export const FOUNDERS: PageContent = {
  title: 'For founders',
  slug: 'founders',
  layout: [
    {
      blockType: 'hero',
      heading: LINES.headline,
      lead: LINES.subheadline,
      primary: { label: LINES.begin, href: `/founders#${FOUNDERS_STORY_ANCHOR}` },
      // The line the copy architecture puts under this hero (src/brand/VOICE.md, names).
      note: 'Built on Subjective Self',
      copyStatus: 'approved',
    },
    {
      blockType: 'statement',
      anchor: FOUNDERS_STORY_ANCHOR,
      kicker: FOUNDERS_STORY_LABEL,
      heading: LINES.storyHeading,
      paragraphs: [
        { text: LINES.shed },
        { text: LINES.today },
        { text: LINES.cabin },
        { text: LINES.question },
        { text: LINES.hands },
        { text: LINES.chapter },
      ],
      copyStatus: 'approved',
    },
    {
      blockType: 'statement',
      heading: LINES.shiftHeading,
      paragraphs: [{ text: LINES.shift }],
      copyStatus: 'approved',
    },
    {
      blockType: 'cards',
      // From IIIC's section marker, "SIX INSIGHTS"; a candidate until IIIC confirms it.
      heading: 'Six Insights',
      cards: [
        { title: LINES.empireTitle, text: LINES.empire },
        { title: LINES.decisionsTitle, text: LINES.decisions },
        { title: LINES.systemsTitle, text: LINES.systems },
        { title: LINES.peopleTitle, text: LINES.people },
        { title: LINES.gratitudeTitle, text: LINES.gratitude },
        { title: LINES.brandTitle, text: LINES.brand },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'points',
      heading: LINES.rhythmHeading,
      lead: LINES.rhythm,
      points: [
        { text: LINES.ownership },
        { text: LINES.load },
        { text: LINES.speaks },
        { text: LINES.space },
      ],
      copyStatus: 'approved',
    },
    {
      blockType: 'band',
      heading: LINES.closingHeading,
      lead: LINES.supporting,
      sanskrit: 'आत्मानं विद्धि',
      translation: 'Know thyself',
      // Books the proposal call under IIIC's label until I-36 defines the offer (D-25); /book/call
      // opens with the booking flow (M3) and leads to the 404 until then.
      primary: { label: LINES.consultation, href: '/book/call' },
      copyStatus: 'approved',
    },
  ],
  facts: [{ statement: LINES.shift, source: 'description', checkedAt: '2026-11-21' }],
}
