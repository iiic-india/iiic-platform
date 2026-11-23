import type { ReactNode } from 'react'
import { Link, Text } from 'react-email'

import { EMAIL, EMAIL_FONTS } from '../palette'

/**
 * Builder C's small text parts (docs/19 §7): a paragraph, a quoted passage and a plain link, in
 * the kit's email colours by role (src/emails/palette.ts), never a hex in a template.
 */
const body = {
  margin: '0 0 16px',
  fontFamily: EMAIL_FONTS.body,
  fontSize: 16,
  lineHeight: '26px',
  color: EMAIL.text,
} as const

export function Para({ children }: { children: ReactNode }) {
  return <Text style={body}>{children}</Text>
}

/** A passage quoted exactly as the person wrote it (a review). */
export function Quote({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        ...body,
        borderLeft: `3px solid ${EMAIL.bar}`,
        paddingLeft: 14,
        color: EMAIL.ink,
      }}
    >
      {children}
    </Text>
  )
}

export function PlainLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} style={{ color: EMAIL.link, textDecoration: 'underline' }}>
      {children}
    </Link>
  )
}

/** A small heading inside the card (a digest's section). */
export function SectionHeading({ children }: { children: string }) {
  return (
    <Text
      style={{
        margin: '20px 0 8px',
        fontFamily: EMAIL_FONTS.heading,
        fontSize: 18,
        lineHeight: '24px',
        color: EMAIL.ink,
      }}
    >
      {children}
    </Text>
  )
}

/** An absolute URL on the site for a path. */
export function siteLink(siteUrl: string, path: string): string {
  return `${siteUrl.replace(/\/$/, '')}${path}`
}
