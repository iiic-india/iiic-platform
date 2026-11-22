import type { ReactNode } from 'react'

import { VOICE_COPY } from '@/lib/proof/copy'
import type { ReviewCardData } from '@/lib/proof/voices'

import styles from './proof.module.css'
import { ReviewCard } from './ReviewCard'

/**
 * Voices beside the text (docs/11 §3.8; D-37). A section with a review pinned to it becomes two
 * columns on wide screens, its content across seven of twelve and the voice across four, and the
 * voice stays beside the section while it scrolls (CSS sticky inside the section's own box, so
 * it gives way to the next section's voice where the section ends); on phones and tablets the
 * voice follows the section's content. CSS only: no scroll listener. In the page the voice comes
 * after the claim, so a screen reader meets the claim first. It reveals once as it comes into
 * view (the chapters' reveal, src/components/experience/RevealChapters.tsx), and never under
 * reduced motion. With nothing pinned the section is drawn as it is, in one column.
 */
export function WithVoice({
  section,
  voice,
  reveal = true,
}: {
  section: ReactNode
  voice: ReviewCardData | undefined
  /** Off inside a chapter, which reveals as a whole (docs/11 §3.5): one moving thing at a time. */
  reveal?: boolean
}) {
  if (!voice) return <>{section}</>
  return (
    <div className={styles.withVoice}>
      <div className={styles.claim}>{section}</div>
      <aside
        className={styles.voice}
        aria-label={VOICE_COPY.label}
        data-reveal={reveal ? '' : undefined}
      >
        <ReviewCard review={voice} excerpt />
      </aside>
    </div>
  )
}

/**
 * Counselling's voices (docs/11 §3.8): up to three plain cards inside the text, after the
 * section's content, with no sticky column and no reveal.
 */
export function PlainVoices({
  section,
  voices,
}: {
  section: ReactNode
  voices: readonly ReviewCardData[] | undefined
}) {
  if (!voices?.length) return <>{section}</>
  return (
    <>
      {section}
      <aside className={styles.plainVoices} aria-label={VOICE_COPY.label}>
        {voices.map((review) => (
          <ReviewCard review={review} excerpt key={review.id} />
        ))}
      </aside>
    </>
  )
}

/** The first voice, under the home page's hero actions: small, the same caption, no motion. */
export function FirstVoice({ voice }: { voice: ReviewCardData | null }) {
  if (!voice) return null
  return (
    <aside className={styles.firstVoice} aria-label={VOICE_COPY.label}>
      <ReviewCard review={voice} excerpt small />
    </aside>
  )
}
