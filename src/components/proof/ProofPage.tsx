import Link from 'next/link'

import { CandidateMark } from '@/components/blocks/PageBlocks'
import { JsonLd } from '@/components/seo/JsonLd'
import { DOOR_FILTERS, PROOF_COPY } from '@/lib/proof/copy'
import type { ReviewDoor } from '@/lib/proof/reviews'
import { reviewsFor, type ReviewCardData } from '@/lib/proof/voices'
import { PROOF_PAGE } from '@/lib/seo/appPages'
import { pageGraph } from '@/lib/seo/schema'

import styles from './proof.module.css'
import { ReviewCard } from './ReviewCard'

/** The address of Proof filtered by a door, opening at the reviews. */
export function proofPath(door: ReviewDoor | null): string {
  return `${PROOF_PAGE.path}${door ? `?door=${door}` : ''}#${PROOF_COPY.voices.anchor}`
}

/** A section's heading, with the candidate marker while IIIC has not approved its words (I-41). */
function Head({
  heading,
  id,
  line,
  candidate,
}: {
  heading: string
  id: string
  line?: string
  candidate: boolean
}) {
  return (
    <>
      <CandidateMark status={candidate ? 'candidate' : 'approved'} />
      <div className="iiic-section-head">
        <div>
          <h2 className="iiic-marked" id={id}>
            {heading}
          </h2>
        </div>
        {line ? <p>{line}</p> : null}
      </div>
    </>
  )
}

/** The honest empty state (VOICE.md: what will appear, and why it is empty). */
function Empty({ heading, text }: { heading: string; text: string }) {
  return (
    <div className="iiic-empty">
      <h3>{heading}</h3>
      <p>{text}</p>
    </div>
  )
}

/** The doors to filter by: links, so they work without JavaScript; the current one marked. */
function DoorFilters({ current }: { current: ReviewDoor | null }) {
  const copy = PROOF_COPY.voices
  return (
    <nav aria-label={copy.filterLabel}>
      <ul className={styles.filters}>
        <li>
          <Link href={proofPath(null)} aria-current={current === null ? 'true' : undefined}>
            {copy.all}
          </Link>
        </li>
        {DOOR_FILTERS.map(({ door, label }) => (
          <li key={door}>
            <Link href={proofPath(door)} aria-current={current === door ? 'true' : undefined}>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * Proof (docs/02; copy architecture §4.7), in the default register: In their words, every
 * published review, the most recent engagement first, filterable by door; verified stories from
 * bookings (Release 2); case studies with client-approved numbers (I-16). Each part says
 * honestly that it is empty until real proof arrives, and nothing is ever written in its place
 * (CLAUDE.md #1). No rating, no stars, and no Review or AggregateRating markup (docs/12 §3): the
 * page's structured data is its own WebPage and breadcrumb only.
 */
export function ProofPage({
  reviews,
  door,
}: {
  reviews: readonly ReviewCardData[]
  door: ReviewDoor | null
}) {
  const shown = reviewsFor(reviews, door)
  const { voices, stories, cases } = PROOF_COPY
  return (
    <div className={`iiic-page ${styles.page}`}>
      <JsonLd graph={pageGraph(PROOF_PAGE)} />
      <header className={styles.head}>
        <h1>{PROOF_COPY.title}</h1>
      </header>
      <section className="iiic-section" id={voices.anchor} aria-labelledby="voices-heading">
        <Head
          heading={voices.heading}
          id="voices-heading"
          line={voices.line}
          candidate={voices.candidate}
        />
        {reviews.length > 0 ? <DoorFilters current={door} /> : null}
        {reviews.length === 0 ? (
          <Empty heading={voices.emptyHeading} text={voices.emptyText} />
        ) : shown.length === 0 ? (
          <Empty heading={voices.emptyDoorHeading} text={voices.emptyDoorText} />
        ) : (
          <ul className={styles.reviews}>
            {shown.map((review) => (
              <li key={review.id}>
                <ReviewCard review={review} id={`review-${review.id}`} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="iiic-section" id={stories.anchor} aria-labelledby="stories-heading">
        <Head heading={stories.heading} id="stories-heading" candidate={stories.candidate} />
        <Empty heading={stories.emptyHeading} text={stories.emptyText} />
      </section>
      <section className="iiic-section" id={cases.anchor} aria-labelledby="cases-heading">
        <Head heading={cases.heading} id="cases-heading" candidate={cases.candidate} />
        <Empty heading={cases.emptyHeading} text={cases.emptyText} />
      </section>
    </div>
  )
}
