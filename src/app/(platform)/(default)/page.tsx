import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { faqsFor, metadataOf, PageJsonLd } from '@/components/blocks/PageAt'
import { RenderBlocks } from '@/components/blocks/PageBlocks'
import { getPage } from '@/lib/content/pages'

/**
 * The home page: the page "home" from the CMS once it is published there, and the starter
 * page until then (D-51; docs/content/copy-architecture.md §4.1). Its title is the site's fixed
 * one (docs/12 §3); its description is the page's own (D-65). It carries the business, the
 * site and the founder in its structured data (D-62).
 */
export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage('home')
  return page ? metadataOf('home', page) : {}
}

export default async function HomePage() {
  const page = await getPage('home')
  if (!page) notFound()
  const faqs = await faqsFor('home', page)
  return (
    <>
      <PageJsonLd slug="home" page={page} faqs={faqs} />
      <RenderBlocks layout={page.layout} faqs={faqs} />
    </>
  )
}
