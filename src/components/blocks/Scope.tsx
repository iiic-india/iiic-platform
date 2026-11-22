import {
  CRISIS_HEADING,
  CRISIS_LINES,
  SCOPE_AWAITS,
  SCOPE_HEADING,
  SCOPE_STATEMENT,
  telHref,
} from '@/lib/counselling/scope'

import styles from './blocks.module.css'

/**
 * The counselling scope statement and the crisis numbers (docs/08 §7), in the one wording
 * every counselling surface shares: the counselling page, whose hero links here by its id, the
 * 404 and the 500 on a counselling path (docs/11 §5.1, item 8; §5.2) and a Journal article that
 * leads to counselling. Until the lawyer fixes the wording it is marked as a draft (I-22). Each
 * number's link also names its line for a screen reader, so that a list of the page's links
 * still says which number is which.
 *
 * It lives in a file of its own, with nothing but its words and the kit's classes, because the
 * counselling 500 is a client component: whatever this file imports is sent to the browser.
 * It draws the section head and the draft mark itself for that reason (the same markup as
 * PageBlocks.tsx's SectionHead and DraftMark).
 */
export function Scope() {
  return (
    <section className="iiic-section" id="scope">
      <div className={styles.candidate}>
        <span className="iiic-badge" data-draft={SCOPE_AWAITS}>
          Draft wording, awaiting legal review ({SCOPE_AWAITS})
        </span>
      </div>
      <div className="iiic-section-head">
        <div>
          <h2 className="iiic-marked">{SCOPE_HEADING}</h2>
        </div>
      </div>
      <div className="iiic-prose">
        {SCOPE_STATEMENT.map((sentence) => (
          <p key={sentence}>{sentence}</p>
        ))}
        <h3>{CRISIS_HEADING}</h3>
        <ul>
          {CRISIS_LINES.map((line) => (
            <li key={line.label}>
              {line.label}:{' '}
              {line.numbers.map((number, index) => (
                <span key={number}>
                  {index > 0 ? ' or ' : null}
                  <a className="iiic-link" href={telHref(number)}>
                    {number}
                    <span className="iiic-sr-only">, {line.label}</span>
                  </a>
                </span>
              ))}
              {line.note ? ` (${line.note})` : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
