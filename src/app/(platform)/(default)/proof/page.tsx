import type { Metadata } from 'next'
import { z } from 'zod'

import { ProofPage } from '@/components/proof/ProofPage'
import { getPublishedReviews } from '@/lib/proof/read'
import { REVIEW_DOORS } from '@/lib/proof/reviews'
import { PROOF_PAGE } from '@/lib/seo/appPages'
import { buildMetadata } from '@/lib/seo/metadata'

/** Every filtered view is the same page to search: its canonical address is /proof. */
export const metadata: Metadata = buildMetadata(PROOF_PAGE)

/** The door to filter by, from the address; anything else shows every review. */
const DOOR = z.enum(REVIEW_DOORS.map(({ value }) => value) as [string, ...string[]])

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/**
 * Proof (docs/02; copy architecture §4.7), in the default register its route group sets: the
 * published reviews, filterable by door, or the honest empty state while none is published
 * (I-42), with the stories' and the case studies' empty states (R2; I-16).
 */
export default async function Proof({ searchParams }: Props) {
  const parsed = DOOR.safeParse((await searchParams).door)
  const door = parsed.success ? (parsed.data as (typeof REVIEW_DOORS)[number]['value']) : null
  return <ProofPage reviews={await getPublishedReviews()} door={door} />
}
