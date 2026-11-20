import type { Metadata } from 'next'

import { metadataAt, PageAt } from '@/components/blocks/PageAt'

/**
 * Counselling (docs/02; docs/content/copy-architecture.md §4.5), in the counselling register
 * its route group sets.
 */
export function generateMetadata(): Promise<Metadata> {
  return metadataAt('counselling')
}

export default function CounsellingPage() {
  return <PageAt slug="counselling" />
}
