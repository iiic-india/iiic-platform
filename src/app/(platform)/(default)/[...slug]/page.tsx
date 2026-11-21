import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { metadataOf, PageJsonLd } from '@/components/blocks/PageAt'
import { RenderBlocks } from '@/components/blocks/PageBlocks'
import { getPage } from '@/lib/content/pages'
import { PAGE_SLUG } from '@/lib/content/slug'
import type { PageContent } from '@/lib/content/types'

type Props = { params: Promise<{ slug: string[] }> }

/**
 * Every path no other route claims. The page at that address is shown (getPage: the published
 * page, else its starter page, D-51, D-57); anything else gets the site's own 404 inside the
 * shell (not-found.tsx beside this folder). An address no page could have is refused before
 * the database is asked, and "home" lives at "/" only.
 */
async function pageAt(
  params: Props['params'],
): Promise<{ slug: string; page: PageContent } | null> {
  const slug = (await params).slug.join('/')
  if (slug === 'home' || !PAGE_SLUG.test(slug)) return null
  const page = await getPage(slug)
  return page ? { slug, page } : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await pageAt(params)
  return found ? metadataOf(found.slug, found.page) : {}
}

export default async function CmsPage({ params }: Props) {
  const found = await pageAt(params)
  if (!found) notFound()
  return (
    <>
      <PageJsonLd slug={found.slug} page={found.page} />
      <RenderBlocks layout={found.page.layout} legalReview={found.page.legalReview} />
    </>
  )
}
