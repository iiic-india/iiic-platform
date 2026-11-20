import type { Metadata } from 'next'

import { metadataAt, PageAt } from '@/components/blocks/PageAt'

/**
 * Learn (docs/02; docs/content/copy-architecture.md §4.6), in the education register its
 * route group sets.
 */
export function generateMetadata(): Promise<Metadata> {
  return metadataAt('learn')
}

export default function LearnPage() {
  return <PageAt slug="learn" />
}
