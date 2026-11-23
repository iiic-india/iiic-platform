'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'

import { type EnquiryFormKind, FORM_COPY, PROPOSAL_CALL } from '@/lib/enquiryForms/strings'

/**
 * What replaces a public form once it is sent (docs/17 §6; docs/13 §4): the request reached
 * IIIC and the office replies within two working days; after a Team Map request, the proposal
 * call can be booked meanwhile. It takes focus when it appears, so a screen reader reads it
 * next. A robot's submission gets the same words, and nothing was stored.
 */
export function Acknowledgement({ kind }: { kind: EnquiryFormKind }) {
  const { acknowledgement, idPrefix } = FORM_COPY[kind]
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  const headingId = `${idPrefix}-received`
  return (
    <div
      className="iiic-alert iiic-alert-green"
      role="status"
      aria-labelledby={headingId}
      tabIndex={-1}
      ref={ref}
      data-acknowledgement={kind}
    >
      <strong id={headingId}>{acknowledgement.heading}</strong>
      {acknowledgement.lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {acknowledgement.callLine ? (
        <p>
          {acknowledgement.callLine}{' '}
          <Link className="iiic-link" href={PROPOSAL_CALL.href}>
            {PROPOSAL_CALL.label}
          </Link>
        </p>
      ) : null}
    </div>
  )
}
