import type { Metadata } from 'next'

import { metadataAt, PageAt } from '@/components/blocks/PageAt'

/**
 * For organisations (docs/02; docs/content/copy-architecture.md §4.4), in the consultancy
 * register its route group sets.
 */
export function generateMetadata(): Promise<Metadata> {
  return metadataAt('organisations')
}

export default function OrganisationsPage() {
  return <PageAt slug="organisations" />
}
