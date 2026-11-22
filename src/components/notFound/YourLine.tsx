'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

import { TakeItWithYou } from '@/components/experience/TakeItWithYou'
import { wordCount } from '@/lib/text/words'

import styles from './notFound.module.css'

/** The words at which the bar reaches full width (docs/11 §5.1: about twelve). */
export const FULL_AT_WORDS = 12

/** How far the bar reaches for a line: its words over FULL_AT_WORDS, at most the whole width. */
export function barShare(text: string): number {
  return Math.min(1, wordCount(text) / FULL_AT_WORDS)
}

/**
 * The 404's line (docs/11 §5.1, items 5 and 6): a plain text field the visitor may write in, the
 * bar under it growing with the words written (the bar is the reader, docs/11 §1), and the
 * actions after it, "Take the line with you" copying what was written to the visitor's own
 * clipboard. The field has no name and sits in no form, and nothing here makes a request: what is
 * written is never stored or sent. The bar is decoration, hidden from assistive technology; it
 * stands at full width under reduced motion and is absent without JavaScript, where the field
 * still takes words and the copy button is not drawn. The field is never focused for the visitor.
 */
export function YourLine({
  id,
  label,
  help,
  takeLabel,
  children,
}: {
  id: string
  label: string
  help: string
  takeLabel: string
  /** The actions before "Take the line with you": "Find your path". */
  children: ReactNode
}) {
  const [text, setText] = useState('')
  const bar = useRef<HTMLSpanElement>(null)

  // A custom property set on the element, not a style attribute in the HTML (D-42).
  useEffect(() => {
    bar.current?.style.setProperty('--written', String(barShare(text)))
  }, [text])

  const helpId = `${id}-help`
  return (
    <div className={styles.line}>
      <label className="iiic-label" htmlFor={id}>
        {label}
      </label>
      <textarea
        className={`iiic-field ${styles.field}`}
        id={id}
        rows={3}
        autoComplete="off"
        aria-describedby={helpId}
        onChange={(event) => setText(event.currentTarget.value)}
      />
      <span ref={bar} className={styles.bar} aria-hidden="true" />
      <p className="iiic-help" id={helpId}>
        {help}
      </p>
      <div className={`iiic-row ${styles.actions}`}>
        {children}
        <TakeItWithYou question={text} label={takeLabel} disabled={text.trim() === ''} />
      </div>
    </div>
  )
}
