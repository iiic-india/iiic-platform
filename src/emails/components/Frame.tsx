import type { ReactNode } from 'react'
import { Body, Column, Container, Head, Html, Img, Link, Preview, Row, Section, Text } from 'react-email'

import { EMAIL, EMAIL_FONTS } from '../palette'

/**
 * The brand frame every email sits in, ported from src/brand/templates/email/booking-confirmation.html
 * (docs/19 §7): the paper page, the mark and name, a white card with the logo's yellow bar down its
 * left edge, and the footer with the legal line, the site and the withdraw or unsubscribe link.
 * Light only; one yellow button at most (Button.tsx); no dark block anywhere (CLAUDE.md #2).
 * Outlook for Windows gets the fixed 600 px ghost table from `render.ts`, which turns the two
 * marker elements below into its conditional comments.
 */
export type FrameProps = {
  /** The hidden preheader: the next step, repeated (docs/13 §5). */
  preheader: string
  /** The small capitals line above the heading, e.g. "Booking confirmed". */
  eyebrow?: string
  heading: string
  children: ReactNode
  footer: FrameFooter
  /** Where the hosted PNGs live (`<site>/email`); never attached, never SVG. */
  assetUrl: string
}

export type FrameFooter = {
  /** The legal name and the address as Settings hold them, or their placeholders. */
  legalLine: string
  siteUrl: string
  siteDisplay: string
  /** The withdraw page (transactional) or the unsubscribe page (promotional), when it needs one. */
  preferences?: { href: string; label: string }
}

/** Marker elements `render.ts` replaces with Outlook's conditional ghost table. */
export const MSO_OPEN = 'data-mso-ghost-open'
export const MSO_CLOSE = 'data-mso-ghost-close'

export function Frame({ preheader, eyebrow, heading, children, footer, assetUrl }: FrameProps) {
  return (
    <Html lang="en-IN" dir="ltr">
      <Head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light only" />
        <meta name="x-apple-disable-message-reformatting" />
      </Head>
      <Preview>{preheader}</Preview>
      <Body style={{ margin: 0, padding: 0, background: EMAIL.page }}>
        <Section style={{ background: EMAIL.page, padding: '36px 16px 40px' }}>
          <span {...{ [MSO_OPEN]: '' }} />
          <Container style={{ width: '100%', maxWidth: 600, margin: '0 auto' }}>
            <Row>
              <Column style={{ padding: '0 4px 22px' }}>
                <Row>
                  <Column style={{ width: 36, paddingRight: 12 }}>
                    <Img
                      src={`${assetUrl}/mark-email-160.png`}
                      width={24}
                      height={42}
                      alt="IIIC"
                      style={{ display: 'block', border: 0 }}
                    />
                  </Column>
                  <Column
                    style={{
                      fontFamily: EMAIL_FONTS.body,
                      fontSize: 14,
                      letterSpacing: 3,
                      fontWeight: 'bold',
                      color: EMAIL.ink,
                      lineHeight: '18px',
                    }}
                  >
                    IIIC
                    <br />
                    <span style={{ fontSize: 12, letterSpacing: 0, fontWeight: 'normal', color: EMAIL.muted }}>
                      Indian Institute of Image Catalysts
                    </span>
                  </Column>
                </Row>
              </Column>
            </Row>
            <Row>
              <Column
                style={{
                  width: 8,
                  background: EMAIL.bar,
                  borderRadius: '18px 0 0 18px',
                  fontSize: 0,
                  lineHeight: 0,
                }}
              >
                &nbsp;
              </Column>
              <Column
                style={{ background: EMAIL.card, borderRadius: '0 18px 18px 0', padding: '36px 36px 32px' }}
              >
                {eyebrow ? (
                  <Text
                    style={{
                      margin: '0 0 14px',
                      fontFamily: EMAIL_FONTS.body,
                      fontSize: 11,
                      letterSpacing: 2.5,
                      textTransform: 'uppercase',
                      fontWeight: 'bold',
                      color: EMAIL.text,
                    }}
                  >
                    {eyebrow}
                  </Text>
                ) : null}
                <h1
                  style={{
                    margin: '0 0 14px',
                    fontFamily: EMAIL_FONTS.heading,
                    fontSize: 32,
                    lineHeight: '38px',
                    fontWeight: 'normal',
                    letterSpacing: -0.5,
                    color: EMAIL.ink,
                  }}
                >
                  {heading}
                </h1>
                {children}
              </Column>
            </Row>
            <Row>
              <Column
                style={{
                  padding: '26px 8px 0',
                  fontFamily: EMAIL_FONTS.body,
                  fontSize: 12,
                  lineHeight: '19px',
                  color: EMAIL.muted,
                }}
              >
                {footer.legalLine}
                <br />
                <Link href={footer.siteUrl} style={{ color: EMAIL.link, textDecoration: 'underline' }}>
                  {footer.siteDisplay}
                </Link>
                {footer.preferences ? (
                  <>
                    {' · '}
                    <Link
                      href={footer.preferences.href}
                      style={{ color: EMAIL.link, textDecoration: 'underline' }}
                    >
                      {footer.preferences.label}
                    </Link>
                  </>
                ) : null}
              </Column>
            </Row>
          </Container>
          <span {...{ [MSO_CLOSE]: '' }} />
        </Section>
      </Body>
    </Html>
  )
}

/** A paragraph of body text in the card. */
export function Paragraph({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        margin: '0 0 18px',
        fontFamily: EMAIL_FONTS.body,
        fontSize: 16,
        lineHeight: '25px',
        color: EMAIL.text,
      }}
    >
      {children}
    </Text>
  )
}
