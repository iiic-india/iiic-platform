import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { JournalList, journalListMetadata } from '@/components/journal/JournalList'
import { JOURNAL_SLUG } from '@/lib/journal/addresses'

type Props = { params: Promise<{ topic: string }> }

/**
 * One topic of the Journal (docs/02): its published articles, newest first. A topic that holds
 * none, and an address no topic could have, is the 404.
 */
async function topicAt(params: Props['params']): Promise<string | null> {
  const topic = (await params).topic
  return JOURNAL_SLUG.test(topic) ? topic : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const topic = await topicAt(params)
  return topic ? journalListMetadata({ topic }) : {}
}

export default async function JournalTopicPage({ params }: Props) {
  const topic = await topicAt(params)
  if (!topic) notFound()
  return <JournalList topic={topic} />
}
