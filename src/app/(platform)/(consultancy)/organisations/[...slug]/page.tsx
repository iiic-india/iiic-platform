import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { metadataAt, PageAt } from '@/components/blocks/PageAt'
import { PAGE_SLUG } from '@/lib/content/slug'

type Props = { params: Promise<{ slug: string[] }> }

/**
 * A page under /organisations/ (docs/02: a service's landing page, the Team Map), in the
 * consultancy register its route group sets. Without this route such a page would be served
 * by the catch-all in the default register. A route built later for one of these addresses
 * (organisations/team-map with its form, or organisations/[service] from the services) takes
 * precedence over it.
 */
async function slugAt(params: Props['params']): Promise<string | null> {
  const slug = `organisations/${(await params).slug.join('/')}`
  return PAGE_SLUG.test(slug) ? slug : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = await slugAt(params)
  return slug ? metadataAt(slug) : {}
}

export default async function OrganisationsSubPage({ params }: Props) {
  const slug = await slugAt(params)
  if (!slug) notFound()
  return <PageAt slug={slug} />
}
