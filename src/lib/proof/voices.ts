import type { Testimonial } from '@/payload-types'

import { FIRST_VOICE, type ReviewDoor } from './reviews'

/**
 * The published reviews as the pages hold them (docs/02; docs/11 §3.8), and how a page finds
 * its voices among them. Pure, so the renderer and the tests read the same thing; the reads
 * themselves are in ./read.ts, on the server.
 */

/** A review as a card shows it: the fields a visitor may read of a published review. */
export type ReviewCardData = Pick<
  Testimonial,
  | 'id'
  | 'shownName'
  | 'displayForm'
  | 'designation'
  | 'organisation'
  | 'showOrganisation'
  | 'place'
  | 'programme'
  | 'year'
  | 'month'
  | 'doors'
  | 'text'
  | 'language'
  | 'translation'
  | 'excerpt'
  | 'connection'
  | 'incentive'
  | 'placements'
  | 'publishedAt'
> & { photo?: { url?: string | null; alt?: string | null } | number | null }

/** The reviews about a door, or all of them. */
export function reviewsFor(
  reviews: readonly ReviewCardData[],
  door: ReviewDoor | null,
): ReviewCardData[] {
  return door === null ? [...reviews] : reviews.filter((review) => review.doors?.includes(door))
}

/** The voices pinned to a page: the first voice under the hero, and those beside each section. */
export type PageVoices = {
  first: ReviewCardData | null
  bySection: Record<string, ReviewCardData[]>
}

export const NO_VOICES: PageVoices = { first: null, bySection: {} }

/**
 * The voices of a page from the published reviews, by the slot each is pinned to. The order of
 * the reviews is kept, so a slot that holds more than one (counselling) shows them as Proof does.
 */
export function voicesOn(reviews: readonly ReviewCardData[], slug: string): PageVoices {
  const voices: PageVoices = { first: null, bySection: {} }
  for (const review of reviews) {
    const placement = review.placements?.find((item) => item.page === slug)
    if (!placement) continue
    if (placement.section === FIRST_VOICE) {
      voices.first ??= review
      continue
    }
    const section = (voices.bySection[placement.section] ??= [])
    section.push(review)
  }
  return voices
}
