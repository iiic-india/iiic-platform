import { FocusOnArrival } from '@/app/(platform)/newsletter/FocusOnArrival'
import { ErrorSummary } from '@/components/forms/ErrorSummary'
import { ERROR_COPY, outcomeText, REQUEST_COPY } from '@/lib/accounts/privacy/copy'
import {
  consentBoxId,
  isGivablePurpose,
  type Outcome,
  outcomeId,
  type Section,
} from '@/lib/accounts/privacy/outcome'

import styles from './privacy.module.css'

/**
 * What a form in this section did, said at the top of the section (docs/20 §7.5): the address the
 * action answered with ends on this note's id, so a browser without JavaScript scrolls to it, and
 * with JavaScript the focus moves here. A box left unticked is an answer to check: the kit's error
 * summary, linked to the box, which takes the focus itself.
 */
export function OutcomeNote({ outcome, section }: { outcome: Outcome | null; section: Section }) {
  if (!outcome || outcome.section !== section) return null
  const id = outcomeId(section)
  if (outcome.code === 'unticked' && isGivablePurpose(outcome.purpose)) {
    return (
      <div id={id} className={styles.outcome}>
        <ErrorSummary
          heading={REQUEST_COPY.checkOne}
          items={[{ id: consentBoxId(outcome.purpose), message: ERROR_COPY.unticked }]}
        />
      </div>
    )
  }
  const done = outcome.tone === 'done'
  return (
    <>
      <div
        id={id}
        className={`iiic-alert ${done ? 'iiic-alert-green' : 'iiic-alert-red'} ${styles.outcome}`}
        role={done ? 'status' : 'alert'}
        tabIndex={-1}
      >
        {outcomeText(outcome)}
      </div>
      <FocusOnArrival id={id} />
    </>
  )
}
