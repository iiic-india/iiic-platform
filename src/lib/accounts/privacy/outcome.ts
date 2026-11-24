import { GIVABLE_PURPOSES, type GivablePurpose } from '@/lib/accounts/contract'
import { CONSENT_PURPOSES, type ConsentPurpose } from '@/lib/privacy/purposes'

/**
 * Where the privacy page's forms lead, and what the page says when it arrives (docs/20 §7.5).
 * Every one-button form posts to a server action that answers with a redirect back to the page
 * (post, redirect, get), so it works without JavaScript and a reload sends nothing twice. The
 * address carries the outcome as codes and a purpose's name, never anything about the person,
 * and ends on the outcome's own id, so a browser without JavaScript scrolls to it and one with
 * JavaScript moves the focus there. Pure: the page, the actions and the tests share it.
 */

export const PRIVACY_PATH = '/account/privacy'
export const CLOSE_PATH = '/account/privacy/close'
export const CLOSED_PATH = '/account/privacy/closed'
export const CONTACT_PATH = '/account/privacy/contact'

export const SECTIONS = ['agreed', 'messages', 'requests', 'contact', 'devices', 'close'] as const
export type Section = (typeof SECTIONS)[number]

export const DONE_CODES = [
  'withdrawn',
  'given',
  'already-given',
  'request-sent',
  'detail-added',
  'signed-out',
] as const
export type DoneCode = (typeof DONE_CODES)[number]

export const ERROR_CODES = [
  'none-in-force',
  'notice-changed',
  'unticked',
  'closed-here',
  'failed',
  'sign-in-again',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

export type Outcome = {
  tone: 'done' | 'error'
  code: DoneCode | ErrorCode
  section: Section
  purpose: ConsentPurpose | null
  count: number | null
}

/** The id of the place on the page where a section's outcome is said. */
export const outcomeId = (section: Section) => `outcome-${section}`

/** The id of the box beside a marketing consent's notice. */
export const consentBoxId = (purpose: GivablePurpose) => `give-${purpose}-consent`

/** The page's address for an outcome. */
export function outcomeHref(
  outcome: Pick<Outcome, 'tone' | 'code' | 'section'> & Partial<Pick<Outcome, 'purpose' | 'count'>>,
  path: string = PRIVACY_PATH,
): string {
  const query = new URLSearchParams({
    [outcome.tone === 'done' ? 'done' : 'error']: outcome.code,
    in: outcome.section,
  })
  if (outcome.purpose) query.set('purpose', outcome.purpose)
  if (typeof outcome.count === 'number') query.set('count', String(outcome.count))
  return `${path}?${query.toString()}#${outcomeId(outcome.section)}`
}

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value

const member = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value)

/** The outcome an address carries, or null; anything it does not know is ignored. */
export function readOutcome(params: Record<string, string | string[] | undefined>): Outcome | null {
  const done = one(params.done)
  const error = one(params.error)
  const section = one(params.in)
  if (!member(SECTIONS, section)) return null
  const purpose = one(params.purpose)
  const count = Number(one(params.count))
  const shared = {
    section,
    purpose: CONSENT_PURPOSES.some(({ value }) => value === purpose)
      ? (purpose as ConsentPurpose)
      : null,
    count: Number.isInteger(count) && count >= 0 && count < 1000 ? count : null,
  }
  if (member(DONE_CODES, done)) return { tone: 'done', code: done, ...shared }
  if (member(ERROR_CODES, error)) return { tone: 'error', code: error, ...shared }
  return null
}

export const isGivablePurpose = (value: unknown): value is GivablePurpose =>
  member(GIVABLE_PURPOSES, value)
