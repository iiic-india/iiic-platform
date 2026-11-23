import tokens from '@/brand/tokens.json'

/**
 * The kit's colours for email (src/brand/templates/email/README.md: "Every colour is from
 * tokens.json"): mail clients read no CSS variables, so the email components take their inline
 * colours from the kit's exported tokens, by role, never as hex in a template.
 */
const color = tokens.color

export const EMAIL = {
  page: color.paper,
  card: color.white,
  bar: color.yellow,
  ticket: color.yellow050,
  ticketBorder: color.mist,
  ink: color.ink,
  text: color.slate,
  muted: color.slate500,
  button: color.yellow,
  buttonText: color.ink,
  link: color.slate,
} as const

/** Fonts that load in mail clients (README: Georgia headlines, Arial text). */
export const EMAIL_FONTS = {
  heading: "Georgia,'Times New Roman',serif",
  body: 'Arial,Helvetica,sans-serif',
  mono: "'Courier New',Courier,monospace",
} as const
