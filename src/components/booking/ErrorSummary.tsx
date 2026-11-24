'use client'

import { useEffect, useRef } from 'react'

import { FLOW_COPY } from './copy'

/**
 * The kit's error summary (src/brand/gallery.html, "Form"): shown after a failed submit, focused
 * so a keyboard and a screen reader land on it, each problem a link to its field (docs/12 §9).
 */
export function ErrorSummary({
  errors,
  idFor,
}: {
  errors: { field: string; message: string }[]
  idFor: (field: string) => string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (errors.length) ref.current?.focus()
  }, [errors])
  if (!errors.length) return null
  return (
    <div className="iiic-error-summary" role="alert" tabIndex={-1} ref={ref}>
      <h2>{FLOW_COPY.errorSummary(errors.length)}</h2>
      <ul>
        {errors.map((error) => (
          <li key={error.field}>
            <a href={`#${idFor(error.field)}`}>{error.message}</a>
          </li>
        ))}
      </ul>
    </div>
  )
}
