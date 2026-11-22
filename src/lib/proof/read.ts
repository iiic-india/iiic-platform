import 'server-only'

import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'
import { cache } from 'react'

import { REVIEWS_TAG } from '@/lib/content/revalidate'
import config from '@payload-config'

import { voicesOn, type PageVoices, type ReviewCardData } from './voices'

/**
 * What Proof and the voices beside the text read (docs/02; docs/11 §3.8): the published
 * reviews, as a visitor may read them (src/access/policy.ts), so a field the person did not
 * agree to show never arrives, and no contact detail or unpublished word ever does. The answer
 * is cached and marked stale when a review is published, changed, withdrawn or deleted
 * (src/lib/content/revalidate.ts); it also refreshes every ten minutes as a safety net
 * (docs/12 §1). One request reads it once, however many components ask.
 */

const CARD_FIELDS = {
  shownName: true,
  displayForm: true,
  designation: true,
  organisation: true,
  showOrganisation: true,
  place: true,
  programme: true,
  year: true,
  month: true,
  doors: true,
  text: true,
  language: true,
  translation: true,
  excerpt: true,
  connection: true,
  incentive: true,
  photo: true,
  placements: true,
  publishedAt: true,
} as const

const REVALIDATE_SECONDS = 600

/** More reviews than Proof would ever hold; a query is never without a limit (docs/12 §4). */
const MOST_REVIEWS = 500

/**
 * Every published review, the most recent engagement first (copy architecture §4.7), then the
 * most recently published.
 */
export const getPublishedReviews = cache(async (): Promise<ReviewCardData[]> => {
  const cached = unstable_cache(
    async () => {
      const payload = await getPayload({ config })
      const { docs } = await payload.find({
        collection: 'testimonials',
        where: { status: { equals: 'published' } },
        sort: ['-year', '-month', '-publishedAt'],
        limit: MOST_REVIEWS,
        pagination: false,
        depth: 1,
        populate: { media: { url: true, alt: true } },
        overrideAccess: false,
        select: CARD_FIELDS,
      })
      return docs as ReviewCardData[]
    },
    ['published-reviews'],
    { tags: [REVIEWS_TAG], revalidate: REVALIDATE_SECONDS },
  )
  return cached()
})

/** The voices of the page at a slug (docs/11 §3.8). */
export async function getPageVoices(slug: string): Promise<PageVoices> {
  return voicesOn(await getPublishedReviews(), slug)
}
