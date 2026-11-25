import {
  type AccountConsentRow,
  type AccountSession,
  GIVABLE_PURPOSES,
  type GivablePurpose,
  OWN_REQUEST_TYPES,
  type OwnRequestType,
  SIGN_IN,
} from '@/lib/accounts/contract'
import {
  activeGrants,
  consentState,
  type ConsentState,
  idOf,
  isWithdrawal,
  type LedgerEntry,
} from '@/lib/privacy/consentLedger'
import { CONSENT_PURPOSES, type ConsentPurpose, ENDED_IN_MY_IIIC } from '@/lib/privacy/purposes'

/**
 * The privacy page's rules, as pure functions (docs/20 §7.5; D-119, D-121). The server functions
 * read the ledger and the requests, then decide here: where the person stands on each purpose
 * across every record the account holds, what My IIIC may offer or withdraw, whether the session
 * is recent enough for a copy, an erasure or closing, and whether a request of a kind is still
 * open. Free of `server-only`: the unit tests and the page's copy read them.
 */

/** A ledger entry with the record it is about. */
export type OwnLedgerEntry = LedgerEntry & { person?: unknown }

/** Where the account stands on one purpose, over all its records. */
export type Standing = { state: ConsentState; changedAt: Date | null }

const latest = (times: (string | null | undefined)[]): Date | null => {
  const instants = times
    .filter((time): time is string => typeof time === 'string')
    .map((time) => Date.parse(time))
    .filter((time) => Number.isFinite(time))
  return instants.length ? new Date(Math.max(...instants)) : null
}

/**
 * One purpose over every record of the account (docs/20 §6: records are linked, never merged).
 * Each record keeps its own ledger, read as the messaging core reads it (`consentState`). The
 * purpose is in force when it is in force on any record, since a message to that record would
 * go, and then it changed when the newest consent in force was given; otherwise it is withdrawn
 * when any record withdrew it, on the latest withdrawal; otherwise there is none.
 */
export function standingOf(entries: readonly OwnLedgerEntry[], purpose: string): Standing {
  const byRecord = new Map<string, OwnLedgerEntry[]>()
  for (const entry of entries) {
    const person = idOf(entry.person)
    if (person === null) continue
    const key = String(person)
    byRecord.set(key, [...(byRecord.get(key) ?? []), entry])
  }
  const records = [...byRecord.values()]
  const inForce = records.filter((record) => consentState(record, purpose) === 'granted')
  if (inForce.length) {
    const given = inForce.flatMap((record) =>
      activeGrants(record)
        .filter((entry) => entry.purpose === purpose)
        .map((entry) => entry.grantedAt),
    )
    return { state: 'granted', changedAt: latest(given) }
  }
  if (records.some((record) => consentState(record, purpose) === 'withdrawn')) {
    const withdrawn = entries
      .filter((entry) => entry.purpose === purpose && isWithdrawal(entry))
      .map((entry) => entry.withdrawnAt)
    return { state: 'withdrawn', changedAt: latest(withdrawn) }
  }
  return { state: 'none', changedAt: null }
}

export const isGivable = (purpose: string): purpose is GivablePurpose =>
  (GIVABLE_PURPOSES as readonly string[]).includes(purpose)

export const isConsentPurpose = (purpose: unknown): purpose is ConsentPurpose =>
  CONSENT_PURPOSES.some(({ value }) => value === purpose)

/** Ended by closing the account rather than by a withdraw button (D-113). */
export const endedByClosing = (purpose: string): boolean =>
  (ENDED_IN_MY_IIIC as readonly string[]).includes(purpose)

/**
 * What decides whether My IIIC offers a marketing consent (D-119; docs/20 §7.5, §4.10): a notice
 * in force for it, no record of the account under 18, and the detail it goes to, verified (an
 * email for the Journal; a mobile, and WhatsApp set up here, for updates on WhatsApp).
 */
export type OfferFacts = {
  notices: Partial<Record<GivablePurpose, number | null>>
  under18: boolean
  verifiedEmail: boolean
  verifiedMobile: boolean
  whatsAppOpen: boolean
}

export function mayOffer(purpose: GivablePurpose, facts: OfferFacts): boolean {
  if (facts.under18 || !facts.notices[purpose]) return false
  return purpose === 'marketingEmail'
    ? facts.verifiedEmail
    : facts.verifiedMobile && facts.whatsAppOpen
}

/**
 * The rows the page shows (`AccountConsentRow`, docs/20 §7.5), in the order of
 * CONSENT_PURPOSES: every purpose on record for the account, in force or withdrawn, and the
 * marketing ones My IIIC may offer. A purpose for a feature not built yet (the Map, suggested
 * programmes) is never offered, only withdrawn while it is in force. The account consent is
 * never withdrawn by a button: closing the account ends it.
 */
export function consentRows(entries: readonly OwnLedgerEntry[], facts: OfferFacts) {
  return CONSENT_PURPOSES.flatMap(({ value, label }) => {
    const { state, changedAt } = standingOf(entries, value)
    const canGive = isGivable(value) && state !== 'granted' && mayOffer(value, facts)
    if (state === 'none' && !canGive) return []
    const row: AccountConsentRow & { label: string } = {
      purpose: value,
      label,
      state,
      changedAt,
      canGive,
      canWithdraw: state === 'granted' && !endedByClosing(value),
      noticeVersionId: canGive && isGivable(value) ? (facts.notices[value] ?? null) : null,
    }
    return [row]
  })
}

/** Whether the session began recently enough for a copy, an erasure or closing (D-121). */
export function signedInRecently(
  account: Pick<AccountSession, 'signedInAt'>,
  now: Date,
  minutes: number = SIGN_IN.recentSignInMinutes,
): boolean {
  return now.getTime() - account.signedInAt.getTime() <= minutes * 60_000
}

/** The requests that need a recent sign-in: a copy of the data, and its erasure (D-121). */
export const NEEDS_RECENT_SIGN_IN: readonly OwnRequestType[] = ['access', 'erasure']

export const isOwnRequestType = (value: unknown): value is OwnRequestType =>
  (OWN_REQUEST_TYPES as readonly unknown[]).includes(value)

/** Whether a request is still open: anything but closed (docs/18 §5). */
export const isOpen = (status: unknown): boolean => status !== 'closed'

/**
 * The most a request's words may hold: `data-requests.summary` keeps 2,000 characters, fewer
 * than the contract's input allows (`ownRequestInput`, 4,000), so the server checks this too.
 */
export const SUMMARY_MAX = 2000
