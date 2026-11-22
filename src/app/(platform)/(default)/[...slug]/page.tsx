import type { Metadata } from 'next'

import { metadataOf, PageJsonLd } from '@/components/blocks/PageAt'
import { RenderBlocks } from '@/components/blocks/PageBlocks'
import { getPage } from '@/lib/content/pages'
import { PAGE_SLUG } from '@/lib/content/slug'
import type { PageContent } from '@/lib/content/types'
import { redirectOrNotFound } from '@/lib/redirects/lookup'
import { pathOf } from '@/lib/redirects/paths'

type Props = { params: Promise<{ slug: string[] }> }

/**
 * Every path no other route claims. The page at that address is shown (getPage: the published
 * page, else its starter page, D-51, D-57); anything else is sent on by the redirect from the
 * address if there is one (an old page's address, or any address the 404 log turned into a
 * redirect), and gets the site's own 404 inside the shell otherwise (not-found.tsx beside this
 * folder). An address no page could have is refused before the pages are read, and "home"
 * lives at "/" only.
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
  if (!found) return redirectOrNotFound(pathOf(...(await params).slug))
  return (
    <>
      <PageJsonLd slug={found.slug} page={found.page} />
      <RenderBlocks
        layout={found.page.layout}
        legalReview={found.page.legalReview}
        slug={found.slug}
      />
    </>
  )
}
