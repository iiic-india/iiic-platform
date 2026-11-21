import type { Metadata } from 'next'

import { JournalList, journalListMetadata } from '@/components/journal/JournalList'

/**
 * The Journal (docs/02; docs/content/copy-architecture.md §4.8), in the education register its
 * route group sets: every published article, newest first, or the honest empty state while
 * there is none (I-19).
 */
export function generateMetadata(): Promise<Metadata> {
  return journalListMetadata({})
}

export default function JournalPage() {
  return <JournalList />
}
