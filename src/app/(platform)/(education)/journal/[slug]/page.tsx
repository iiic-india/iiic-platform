import type { Metadata } from 'next'

import { Article } from '@/components/journal/Article'
import { getPostToShow } from '@/lib/journal/posts'
import { articleMetadata } from '@/lib/journal/seo'
import { redirectOrNotFound } from '@/lib/redirects/lookup'
import { pathOf } from '@/lib/redirects/paths'

type Props = { params: Promise<{ slug: string }> }

/**
 * A Journal article (docs/02), in the education register its route group sets: the published
 * article at its address, never a draft; anything else is the 404 in the same register.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPostToShow((await params).slug)
  return post ? articleMetadata(post) : {}
}

export default async function JournalArticlePage({ params }: Props) {
  const { slug } = await params
  const post = await getPostToShow(slug)
  if (!post) return redirectOrNotFound(pathOf('journal', slug))
  return <Article post={post} />
}
