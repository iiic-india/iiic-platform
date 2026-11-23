import type { Refusal } from './strings'

/**
 * What a form's server action hands back to the form (docs/17 §6), and so what the form draws
 * next: the fields again with a message beside each that needs one and the error summary above
 * them, a refusal with what to do instead, or the acknowledgement. What was typed comes back so
 * the form keeps it; it travels to the person's own browser only, and nothing here is logged.
 * No server-only import: the client form reads the type and the first state.
 */

/** A consent text as the form shows it beside the box. */
export type NoticeShown = { version: number; text: string }

export type EnquiryFormState = {
  status: 'idle' | 'invalid' | 'refused' | 'received'
  /** A message per field name, in the order the form asks. */
  errors: Readonly<Record<string, string>>
  refusal?: Refusal
  /** What was typed, by field name, to draw again. */
  values: Readonly<Record<string, string>>
  /** The campaign tags the first submission came with, kept for the next one. */
  utm: Readonly<Record<string, string>>
  /** The notice now in force, when it changed after the page was drawn. */
  notice?: NoticeShown
  /** Counts the answers, so the summary takes focus again and the spam check starts again. */
  attempt: number
}

export const INITIAL_FORM_STATE: EnquiryFormState = {
  status: 'idle',
  errors: {},
  values: {},
  utm: {},
  attempt: 0,
}

/** The names of the hidden fields the server draws into a form and reads back. */
export const HIDDEN = {
  drawn: 'drawn',
  page: 'page',
  noticeVersion: 'noticeVersion',
  trap: 'homepage',
  turnstile: 'cf-turnstile-response',
} as const

/** The campaign tags a form carries, by their name in a link (utm_source, …). */
export const UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content'] as const
