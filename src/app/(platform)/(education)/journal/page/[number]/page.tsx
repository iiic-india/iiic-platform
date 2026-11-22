import type { Metadata } from 'next'
import { permanentRedirect } from 'next/navigation'

import { JournalList, journalListMetadata } from '@/components/journal/JournalList'
import { listPath, pageNumber } from '@/lib/journal/addresses'
import { redirectOrNotFound } from '@/lib/redirects/lookup'
import { pathOf } from '@/lib/redirects/paths'

type Props = { params: Promise<{ number: string }> }

/**
 * A later page of the Journal (docs/02): /journal/page/2 and on. Page 1 is the Journal itself,
 * so its own address redirects there; a page past the last, or anything that is not a page
 * number, is the 404.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = pageNumber((await params).number)
  return page && page > 1 ? journalListMetadata({ page }) : {}
}

export default async function JournalLaterPage({ params }: Props) {
  const { number } = await params
  const page = pageNumber(number)
  if (page === 1) permanentRedirect(listPath())
  if (!page) return redirectOrNotFound(pathOf('journal', 'page', number))
  return <JournalList page={page} />
}
