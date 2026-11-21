'use client'

import { type ReactNode, useState } from 'react'

import { FLIP_COPY } from './copy'
import styles from './experience.module.css'

/** One line of the comparison, drawn on the server: how it reads as the object and as the subject. */
export type FlipLine = { object: ReactNode; subject: ReactNode }

/**
 * Flip the line (docs/11 §3.2): each line is a button that shows its object side until it is
 * pressed, then its subject side with the bar under it, and back again. "Flip all" turns every
 * line at once, and back once all are turned; "Show both" opens the plain table, which is also
 * what a browser without scripts, and a printer, shows in place of the lines
 * (experience.module.css).
 *
 * A line's accessible name is the side it shows; aria-pressed says which side that is, and a
 * hint, hidden from sight and referenced by aria-describedby (with aria-description where a
 * screen reader reads it), says what pressing it does. Pressing never moves focus: the button
 * stays where it is and only its words change, in one shared cell, so nothing shifts.
 */
export function FlipLines({
  id,
  lines,
  children,
}: {
  /** A name for this comparison, unique on the page: its hints and its table are named from it. */
  id: string
  lines: FlipLine[]
  /** The plain table. */
  children: ReactNode
}) {
  const [asSubject, setAsSubject] = useState<readonly boolean[]>(() => lines.map(() => false))
  const [bothShown, setBothShown] = useState(false)
  const pressed = (index: number) => asSubject[index] === true
  const allPressed = lines.length > 0 && lines.every((_, index) => pressed(index))
  const hints = { toSubject: `${id}_to-subject`, toObject: `${id}_to-object` }
  const bothId = `${id}_both`

  const flip = (index: number) =>
    setAsSubject((current) =>
      lines.map((_, at) => (at === index ? current[at] !== true : current[at] === true)),
    )

  return (
    <>
      <div className={styles.flip}>
        <span id={hints.toSubject} hidden>
          {FLIP_COPY.toSubject}
        </span>
        <span id={hints.toObject} hidden>
          {FLIP_COPY.toObject}
        </span>
        <ul className={styles.flipLines}>
          {lines.map((line, index) => {
            const asSubjectNow = pressed(index)
            return (
              <li key={index}>
                {/* aria-description, which docs/11 §3.2 asks for beside aria-describedby, is a
                    global attribute of ARIA 1.3, newer than the lint rule's table of roles. */}
                {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props */}
                <button
                  type="button"
                  className={styles.flipLine}
                  aria-pressed={asSubjectNow}
                  aria-describedby={asSubjectNow ? hints.toObject : hints.toSubject}
                  aria-description={asSubjectNow ? FLIP_COPY.toObject : FLIP_COPY.toSubject}
                  onClick={() => flip(index)}
                >
                  <span className={styles.face} data-face="object" aria-hidden={asSubjectNow}>
                    {line.object}
                  </span>
                  <span className={styles.face} data-face="subject" aria-hidden={!asSubjectNow}>
                    {line.subject}
                  </span>
                  <span className={styles.flipBar} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
        <div className={`iiic-row ${styles.flipActions}`}>
          <button
            type="button"
            className={`iiic-btn iiic-btn-secondary ${styles.flipAll}`}
            aria-pressed={allPressed}
            onClick={() => setAsSubject(lines.map(() => !allPressed))}
          >
            {FLIP_COPY.flipAll}
          </button>
          <a className="iiic-link" href={`#${bothId}`} onClick={() => setBothShown(true)}>
            {FLIP_COPY.showBoth}
          </a>
        </div>
      </div>
      <div className={styles.both} id={bothId} data-shown={bothShown ? '' : undefined}>
        {children}
      </div>
    </>
  )
}
