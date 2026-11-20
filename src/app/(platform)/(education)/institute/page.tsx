import type { Metadata } from 'next'

import { metadataAt, PageAt } from '@/components/blocks/PageAt'

/**
 * The institute's academic pages until iiic.edu.in opens (docs/02; docs/00), in the education
 * register its route group sets.
 */
export function generateMetadata(): Promise<Metadata> {
  return metadataAt('institute')
}

export default function InstitutePage() {
  return <PageAt slug="institute" />
}
