'use client'

import { useEffect, useRef } from 'react'

/** An answer the summary names: the field's id, which its link opens, and the message beside it. */
export type SummaryItem = { id: string; message: string }

/**
 * The kit's error summary (src/brand/gallery.html, "Form"): above the form after a failed send,
 * with a link to each answer to check, or the one reason the form was not taken. It takes focus
 * when it appears, so a keyboard or screen reader starts from it; the form keys it by the answer,
 * so every new answer moves focus here again. Drawn on the server too, where a browser without
 * JavaScript reads it first through the form's address (`#` and the form's id).
 */
export function ErrorSummary({
  heading,
  items = [],
  text,
}: {
  heading: string
  items?: readonly SummaryItem[]
  text?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    <div className="iiic-error-summary" role="alert" tabIndex={-1} ref={ref}>
      <h2>{heading}</h2>
      {text ? <p>{text}</p> : null}
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`}>{item.message}</a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
