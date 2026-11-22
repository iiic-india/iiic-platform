import { languageLabel } from '@/lib/site/languages'

import type { ReviewDoor } from './reviews'

/**
 * The words of Proof and of the voices beside the text (docs/02; docs/11 §3.8;
 * docs/content/copy-architecture.md §4.7, §6), in one place for en-IN. The "In their words"
 * heading and the line under it are proposals awaiting IIIC's approval (I-41), and the stories'
 * heading is the copy system's, awaiting the same; each is drawn with the candidate marker. The
 * empty states follow VOICE.md (what will appear, and why it is empty); the stories' is the
 * kit's own (gallery.html).
 */
export const PROOF_COPY = {
  title: 'Proof',
  voices: {
    anchor: 'voices',
    heading: 'In their words',
    line: 'Every review here is published with the permission of the person who wrote it. We hold the original.',
    candidate: true,
    filterLabel: 'Show reviews about',
    all: 'All reviews',
    emptyHeading: 'No reviews published yet',
    emptyText:
      'Reviews of Gaurang Mistry’s programmes will appear here once the people who wrote them have agreed to their publication.',
    emptyDoorHeading: 'None published for this door yet',
    emptyDoorText: 'Reviews about it will appear here once their writers have agreed.',
  },
  stories: {
    anchor: 'stories',
    heading: 'Same Life. A Clearer Self.',
    candidate: true,
    emptyHeading: 'No verified stories yet',
    emptyText:
      'Verified client stories will appear here. We only publish proof tied to a real booking.',
  },
  cases: {
    anchor: 'case-studies',
    heading: 'Case studies',
    candidate: false,
    emptyHeading: 'No case studies yet',
    emptyText:
      'Case studies will appear here once each client has approved the names and numbers in them.',
  },
} as const

/** The doors Proof filters by, as the filter names them. */
export const DOOR_FILTERS: { door: ReviewDoor; label: string }[] = [
  { door: 'consultancy', label: 'Consultancy' },
  { door: 'education', label: 'Education' },
  { door: 'counselling', label: 'Counselling' },
  { door: 'framework', label: 'The framework' },
]

/** The words a voice carries besides the review (docs/11 §3.8; copy architecture §6). */
export const VOICE_COPY = {
  /** The aside's name for a screen reader. */
  label: 'In their words',
  /** The link from an excerpt to the whole review on Proof. */
  readAll: 'Read the full review',
  /** The label over an approved translation: "Translated from Gujarati". */
  translatedFrom: (language: string) => `Translated from ${languageLabel(language)}`,
  /** The disclosure of anything given for a review (docs/08 §6). */
  incentive: (what: string) => `Received for this review: ${what}`,
} as const
