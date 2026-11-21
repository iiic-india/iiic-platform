import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { metadataAt, PageAt } from '@/components/blocks/PageAt'
import { PAGE_SLUG } from '@/lib/content/slug'

type Props = { params: Promise<{ slug: string[] }> }

/**
 * A page under /counselling/, in the counselling register its route group sets, and the 404
 * for an address there, with the scope statement and the crisis numbers. Without this route
 * such a page would be served by the catch-all in the default register. A page here carries
 * the scope block too (src/blocks/pageBlocks.ts, carriesFixedStatements). A route built later
 * for one of these addresses takes precedence over it.
 */
async function slugAt(params: Props['params']): Promise<string | null> {
  const slug = `counselling/${(await params).slug.join('/')}`
  return PAGE_SLUG.test(slug) ? slug : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = await slugAt(params)
  return slug ? metadataAt(slug) : {}
}

export default async function CounsellingSubPage({ params }: Props) {
  const slug = await slugAt(params)
  if (!slug) notFound()
  return <PageAt slug={slug} />
}
