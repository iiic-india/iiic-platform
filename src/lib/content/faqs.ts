import 'server-only'

import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'
import { cache } from 'react'

import config from '@payload-config'

import { FAQS_TAG, faqsTag } from './revalidate'
import type { FaqItem } from './types'

/** More questions than a page would ever show; a query is never without a limit (docs/12 §4). */
const MOST_QUESTIONS = 100

/**
 * The questions published for the page at a slug, in their order, as a visitor may read them:
 * drafts are not returned (src/access/policy.ts).
 */
async function findPublishedFaqs(slug: string): Promise<FaqItem[]> {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'faqs',
    where: { page: { equals: slug } },
    sort: ['order', 'createdAt'],
    limit: MOST_QUESTIONS,
    pagination: false,
    depth: 0,
    overrideAccess: false,
    select: { question: true, answer: true },
  })
  return docs.map(({ id, question, answer }) => ({ id: String(id), question, answer }))
}

/**
 * The questions a page's questions section shows, and the only ones its structured data names
 * (D-62). The CMS data is cached and marked stale when an editor publishes, changes, moves or
 * deletes a question (src/collections/Faqs.ts; docs/12 §1, §4), and one request reads it once
 * however many components ask.
 */
export const getFaqs = cache(
  async (slug: string): Promise<FaqItem[]> =>
    unstable_cache(() => findPublishedFaqs(slug), ['page-faqs', slug], {
      tags: [FAQS_TAG, faqsTag(slug)],
    })(),
)
