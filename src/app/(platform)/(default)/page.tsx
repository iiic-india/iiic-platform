import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { metadataOf, PageJsonLd } from '@/components/blocks/PageAt'
import { RenderBlocks } from '@/components/blocks/PageBlocks'
import { getPage } from '@/lib/content/pages'
import { logMissingPage } from '@/lib/redirects/log'

/**
 * The home page: the page "home" from the CMS once it is published there, and the starter
 * page until then (D-51; docs/content/copy-architecture.md §4.1). Its title is the site's fixed
 * one (docs/12 §3); its description is the page's own (D-65). It carries the business, the
 * site and the founder in its structured data (D-62). While a published home page is
 * unpublished, "/" is the 404 (D-57), and like every route answering with the 404 it writes the
 * address to the 404 log first (docs/11 §5.1, item 9; src/lib/redirects/log.ts).
 */
export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage('home')
  return page ? metadataOf('home', page) : {}
}

export default async function HomePage() {
  const page = await getPage('home')
  if (!page) {
    await logMissingPage()
    notFound()
  }
  return (
    <>
      <PageJsonLd slug="home" page={page} />
      <RenderBlocks layout={page.layout} />
    </>
  )
}
