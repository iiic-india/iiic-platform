import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getPage } from '@/lib/content/pages'

import { RenderBlocks } from './PageBlocks'

/**
 * The page at a slug, drawn: the CMS page while it is published, the starter page until a page
 * at that address is first published (D-51), and the site's 404 otherwise, as while a page
 * that was published is unpublished (D-57).
 */
export async function PageAt({ slug }: { slug: string }) {
  const page = await getPage(slug)
  if (!page) notFound()
  return <RenderBlocks layout={page.layout} legalReview={page.legalReview} />
}

/** A page's title and description for the browser tab, search results and shared links. */
export async function metadataAt(slug: string): Promise<Metadata> {
  const page = await getPage(slug)
  if (!page) return {}
  return { title: page.title, ...(page.description ? { description: page.description } : {}) }
}
