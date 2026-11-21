import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'

import { JournalList, journalListMetadata } from '@/components/journal/JournalList'
import { JOURNAL_SLUG, listPath, pageNumber } from '@/lib/journal/addresses'

type Props = { params: Promise<{ topic: string; number: string }> }

/**
 * A later page of one topic (docs/02): /journal/topic/<topic>/page/2 and on. Page 1 is the
 * topic itself, so its own address redirects there; a page past the last, a topic that holds
 * no published article, or anything that is not a page number, is the 404.
 */
async function addressOf(params: Props['params']) {
  const { topic, number } = await params
  return { topic: JOURNAL_SLUG.test(topic) ? topic : null, page: pageNumber(number) }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { topic, page } = await addressOf(params)
  return topic && page && page > 1 ? journalListMetadata({ topic, page }) : {}
}

export default async function JournalTopicLaterPage({ params }: Props) {
  const { topic, page } = await addressOf(params)
  if (!topic || !page) notFound()
  if (page === 1) permanentRedirect(listPath(topic))
  return <JournalList topic={topic} page={page} />
}
