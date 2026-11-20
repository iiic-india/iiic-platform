import { notFound } from 'next/navigation'

import { RenderBlocks } from '@/components/blocks/PageBlocks'
import { getPage } from '@/lib/content/pages'

/**
 * The home page: the page "home" from the CMS once it is published there, and the starter
 * page until then (D-51; docs/content/copy-architecture.md §4.1). Its title and description
 * are the site's own, set in the platform layout.
 */
export default async function HomePage() {
  const page = await getPage('home')
  if (!page) notFound()
  return <RenderBlocks layout={page.layout} />
}
