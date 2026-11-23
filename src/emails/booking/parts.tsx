import type { ReactNode } from 'react'

import { Frame, Paragraph } from '../components/Frame'
import { Button, CounsellingScope, type Detail } from '../components/parts'
import type { EmailContext } from '../types'
import { JOIN_BUTTON, LABELS, placeOf, RESCHEDULE_LINE, whenOf } from './copy'
import type { SessionData } from './data'

/**
 * The parts the booking emails share (docs/19 §7): the details ticket of a booking (what, when,
 * where, the link, the reference), the one button an online booking gets, and the closing line on
 * how to change it. Built on the frame's own parts, so the brand rules hold in one place.
 */

export function sessionRows(data: SessionData, extra: readonly Detail[] = []): Detail[] {
  const rows: Detail[] = [
    { label: LABELS.what, value: data.serviceName },
    { label: LABELS.when, value: whenOf(data) },
    { label: LABELS.where, value: placeOf(data) },
  ]
  if (data.format === 'online' && data.meetingUrl) {
    rows.push({ label: LABELS.link, value: data.meetingUrl, mono: true })
  }
  rows.push({ label: LABELS.reference, value: data.reference, mono: true }, ...extra)
  return rows
}

/** An online booking's one button: its link. An office booking has none. */
export function JoinButton({ data }: { data: SessionData }) {
  return data.format === 'online' && data.meetingUrl ? (
    <Button href={data.meetingUrl}>{JOIN_BUTTON}</Button>
  ) : null
}

/** The frame with the email's footer from the core, and the scope when it is a counselling one. */
export function BookingFrame({
  context,
  preheader,
  eyebrow,
  heading,
  counselling,
  children,
}: {
  context: EmailContext
  preheader: string
  eyebrow: string
  heading: string
  /**
   * A counselling booking: its email carries the scope and the crisis numbers (VOICE.md, counselling
   * emails; the registry marks the templates that must, `counsellingScope`).
   */
  counselling: boolean
  children: ReactNode
}) {
  return (
    <Frame
      preheader={preheader}
      eyebrow={eyebrow}
      heading={heading}
      footer={context.footer}
      assetUrl={context.assetUrl}
    >
      {children}
      {counselling ? <CounsellingScope /> : null}
    </Frame>
  )
}

export function RescheduleLine() {
  return <Paragraph>{RESCHEDULE_LINE}</Paragraph>
}
