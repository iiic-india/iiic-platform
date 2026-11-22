import type { Metadata } from 'next'

import { JsonLd } from '@/components/seo/JsonLd'
import { getPage } from '@/lib/content/pages'
import { pagePath } from '@/lib/content/slug'
import type { PageContent } from '@/lib/content/types'
import { redirectOrNotFound } from '@/lib/redirects/lookup'
import { buildMetadata } from '@/lib/seo/metadata'
import { pageGraph } from '@/lib/seo/schema'
import { HOME_TITLE } from '@/lib/seo/site'

import { RenderBlocks } from './PageBlocks'

/**
 * The page at a slug, drawn: the CMS page while it is published, the starter page until a page
 * at that address is first published (D-51), and otherwise the redirect from the address if
 * there is one, else the site's 404, as while a page that was published is unpublished (D-57).
 * Its structured data comes first (D-62).
 */
export async function PageAt({ slug }: { slug: string }) {
  const page = await getPage(slug)
  if (!page) return redirectOrNotFound(pagePath(slug))
  return (
    <>
      <PageJsonLd slug={slug} page={page} />
      <RenderBlocks layout={page.layout} legalReview={page.legalReview} slug={slug} />
    </>
  )
}

/** A page's title and description for the browser tab, search results and shared links. */
export async function metadataAt(slug: string): Promise<Metadata> {
  const page = await getPage(slug)
  return page ? metadataOf(slug, page) : {}
}

/**
 * The metadata of a page the route already holds: the title and description the page has, in
 * the CMS or in its starter file (D-65, D-68), with the canonical URL and the share tags.
 */
export function metadataOf(slug: string, page: Pick<PageContent, 'title' | 'description'>) {
  return buildMetadata({
    path: pagePath(slug),
    title: slug === 'home' ? HOME_TITLE : page.title,
    description: page.description,
  })
}

/**
 * The page's JSON-LD: its own nodes, and below the home page the way down to it, through the
 * pages above it that exist (an address with no page of its own is skipped).
 */
export async function PageJsonLd({
  slug,
  page,
}: {
  slug: string
  page: Pick<PageContent, 'title' | 'description'>
}) {
  const parts = slug.split('/')
  const ancestors = await Promise.all(
    parts.slice(0, -1).map(async (_, index) => {
      const ancestor = parts.slice(0, index + 1).join('/')
      const found = await getPage(ancestor)
      return found ? { path: pagePath(ancestor), title: found.title } : null
    }),
  )
  const graph = pageGraph({
    path: pagePath(slug),
    title: slug === 'home' ? HOME_TITLE : page.title,
    description: page.description,
    trail: ancestors.filter((step) => step !== null),
  })
  return <JsonLd graph={graph} />
}
