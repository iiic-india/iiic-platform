import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { RenderBlocks } from '@/components/blocks/PageBlocks'
import { getPage } from '@/lib/content/pages'
import { PAGE_SLUG } from '@/lib/content/slug'
import type { PageContent } from '@/lib/content/types'

type Props = { params: Promise<{ slug: string[] }> }

/**
 * Every path no other route claims. A published page with that address is shown; anything
 * else gets the site's own 404 inside the shell (not-found.tsx beside this folder). An address
 * no page could have is refused before the database is asked, and "home" lives at "/" only.
 */
async function pageAt(params: Props['params']): Promise<PageContent | null> {
  const slug = (await params).slug.join('/')
  if (slug === 'home' || !PAGE_SLUG.test(slug)) return null
  return getPage(slug)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await pageAt(params)
  if (!page) return {}
  return { title: page.title, ...(page.description ? { description: page.description } : {}) }
}

export default async function CmsPage({ params }: Props) {
  const page = await pageAt(params)
  if (!page) notFound()
  return <RenderBlocks layout={page.layout} legalReview={page.legalReview} />
}
