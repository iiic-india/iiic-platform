import { VOICE_COPY } from '@/lib/proof/copy'
import { connectionCard, isCounsellingReview, whenShown } from '@/lib/proof/reviews'
import type { ReviewCardData } from '@/lib/proof/voices'
import { DEFAULT_LANGUAGE } from '@/lib/site/languages'

import styles from './proof.module.css'

/**
 * One review as the kit's proof card draws it (`.iiic-card .iiic-card-proof`; docs/11 §3.8;
 * copy architecture §6): the words as written, or the excerpt the person approved; a review in
 * Gujarati or Hindi in its own language, with `lang`, and the English translation the person
 * approved after it; then the caption, the name in the form chosen, the designation, the
 * organisation where agreed and the place on one line, the programme and year on the next, and
 * any connection to Gaurang Mistry or IIIC and anything given for the review, disclosed
 * (docs/08 §6). A counselling review shown with initials shows the place alone beside them.
 * No rating, no stars, no Review markup (docs/12 §3).
 */
export function ReviewCard({
  review,
  excerpt = false,
  small = false,
  id,
}: {
  review: ReviewCardData
  /** Shows the approved excerpt, with a link to the whole review on Proof. */
  excerpt?: boolean
  /** The first voice under the home page's hero: set small. */
  small?: boolean
  id?: string
}) {
  const shortened = excerpt && Boolean(review.excerpt)
  const words = shortened ? review.excerpt! : (review.text ?? '')
  const language = review.language ?? DEFAULT_LANGUAGE
  const foreign = language !== DEFAULT_LANGUAGE
  const initialsOnly = isCounsellingReview(review.doors) && review.displayForm === 'initials'
  const nameLine = [
    review.shownName,
    initialsOnly ? null : review.designation,
    initialsOnly || !review.showOrganisation ? null : review.organisation,
    review.place,
  ]
    .filter(Boolean)
    .join(' · ')
  const programmeLine = [review.programme, whenShown(review.year, review.month)]
    .filter(Boolean)
    .join(', ')
  const connection = connectionCard(review.connection)
  const photo = typeof review.photo === 'object' && review.photo?.url ? review.photo : null
  return (
    <div
      className={`iiic-card iiic-card-proof ${styles.card}${small ? ` ${styles.small}` : ''}`}
      id={id}
    >
      <blockquote lang={foreign ? language : undefined}>{words}</blockquote>
      {foreign && review.translation ? (
        <div className={styles.translation}>
          <p className="iiic-type-small">{VOICE_COPY.translatedFrom(language)}</p>
          <p lang={DEFAULT_LANGUAGE}>{review.translation}</p>
        </div>
      ) : null}
      <footer className={styles.caption}>
        {photo ? (
          // A photograph the person agreed to (docs/11 §3.8): 48 px, lazy, sized so nothing shifts.
          // eslint-disable-next-line @next/next/no-img-element -- media is served from the public bucket as stored
          <img
            className={styles.photo}
            src={photo.url!}
            alt=""
            width={48}
            height={48}
            loading="lazy"
          />
        ) : null}
        <span className={styles.captionLines}>
          {nameLine ? <span className={styles.name}>{nameLine}</span> : null}
          {programmeLine ? <span>{programmeLine}</span> : null}
          {connection ? <span>{connection}</span> : null}
          {review.incentive ? <span>{VOICE_COPY.incentive(review.incentive)}</span> : null}
          {shortened ? (
            <a className="iiic-link" href={`/proof#review-${review.id}`}>
              {VOICE_COPY.readAll}
            </a>
          ) : null}
        </span>
      </footer>
    </div>
  )
}
