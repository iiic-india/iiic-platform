import type { Metadata } from 'next'

import { metadataAt, PageAt } from '@/components/blocks/PageAt'

/**
 * The founders' landing page (docs/02; docs/content/copy-architecture.md §4.3, D-25), in the
 * consultancy register its route group sets.
 */
export function generateMetadata(): Promise<Metadata> {
  return metadataAt('founders')
}

export default function FoundersPage() {
  return <PageAt slug="founders" />
}
