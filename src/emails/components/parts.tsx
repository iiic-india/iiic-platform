import type { CSSProperties } from 'react'
import { Column, Link, Row, Section, Text } from 'react-email'

import { CRISIS_HEADING, CRISIS_LINES, SCOPE_HEADING, SCOPE_STATEMENT } from '@/lib/counselling/scope'

import { EMAIL, EMAIL_FONTS } from '../palette'

/**
 * The parts emails are built from (docs/19 §7), each ported from the kit's email templates: the
 * one yellow pill button, the details "ticket", and the counselling scope statement with the
 * crisis numbers, whose words come from src/lib/counselling/scope.ts so every surface says the
 * same (docs/08 §7).
 */

/** Outlook keeps the button's padding with this (README); React writes it as mso-padding-alt. */
const OUTLOOK_PADDING = { msoPaddingAlt: '14px 26px' } as CSSProperties

/** The one yellow button an email may have (README: one per email). Outlook draws it square. */
export function Button({ href, children }: { href: string; children: string }) {
  return (
    <Section style={{ padding: '8px 0 10px' }}>
      <Row>
        <Column style={{ background: EMAIL.button, borderRadius: 999, ...OUTLOOK_PADDING }}>
          <Link
            href={href}
            style={{
              display: 'inline-block',
              padding: '14px 26px',
              fontFamily: EMAIL_FONTS.body,
              fontSize: 15,
              fontWeight: 'bold',
              color: EMAIL.buttonText,
              textDecoration: 'none',
            }}
          >
            {children}
          </Link>
        </Column>
      </Row>
    </Section>
  )
}

/** One line of the details ticket: a label and its value. */
export type Detail = { label: string; value: string; mono?: boolean }

/** The details ticket on the yellow tint (what, when, where, reference). */
export function Details({ rows }: { rows: readonly Detail[] }) {
  return (
    <Section
      style={{
        background: EMAIL.ticket,
        border: `1px solid ${EMAIL.ticketBorder}`,
        borderRadius: 14,
        padding: '20px 22px',
        margin: '0 0 24px',
      }}
    >
      {rows.map((row) => (
        <Row key={row.label}>
          <Column
            style={{
              width: 110,
              padding: '3px 0',
              fontFamily: EMAIL_FONTS.body,
              fontSize: 13,
              color: EMAIL.muted,
              verticalAlign: 'top',
            }}
          >
            {row.label}
          </Column>
          <Column
            style={{
              padding: '3px 0',
              fontFamily: row.mono ? EMAIL_FONTS.mono : EMAIL_FONTS.body,
              fontSize: row.mono ? 14 : 15,
              lineHeight: '24px',
              color: EMAIL.ink,
            }}
          >
            {row.value}
          </Column>
        </Row>
      ))}
    </Section>
  )
}

const small = {
  margin: '0 0 8px',
  fontFamily: EMAIL_FONTS.body,
  fontSize: 13,
  lineHeight: '20px',
  color: EMAIL.text,
} as const

/**
 * The scope statement and the crisis numbers, carried by every counselling confirmation and
 * reminder (docs/06, Engine rules; docs/13 §5). Never omitted for a counselling booking: the
 * template registry marks the templates that must show it.
 */
export function CounsellingScope() {
  return (
    <Section style={{ borderTop: `1px solid ${EMAIL.ticketBorder}`, padding: '18px 0 0', margin: '8px 0 0' }}>
      <Text style={{ ...small, fontWeight: 'bold', color: EMAIL.ink }}>{SCOPE_HEADING}</Text>
      {SCOPE_STATEMENT.map((line) => (
        <Text key={line} style={small}>
          {line}
        </Text>
      ))}
      <Text style={{ ...small, fontWeight: 'bold', color: EMAIL.ink, marginTop: 12 }}>
        {CRISIS_HEADING}
      </Text>
      {CRISIS_LINES.map((line) => (
        <Text key={line.label} style={small}>
          {line.label}: {line.numbers.join(' or ')}
          {line.note ? ` (${line.note})` : ''}
        </Text>
      ))}
    </Section>
  )
}
