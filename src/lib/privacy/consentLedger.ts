/**
 * The consent ledger's rules, as pure functions (docs/04 `consents`, docs/08 §3, docs/12 §11).
 * The ledger is append-only: an entry is never changed or deleted. A consent is an entry with the
 * time it was given; its withdrawal is a second entry that names it, with the time it was
 * withdrawn, so the history of what a person agreed to, under which notice, is never lost.
 */

/** One entry, as far as these rules read it. A relationship comes as an id or populated. */
export type LedgerEntry = {
  id: number | string
  purpose: string
  grantedAt: string
  withdrawnAt?: string | null
  withdraws?: unknown
}

export type ConsentState = 'granted' | 'withdrawn' | 'none'

/** What the ledger answers when it refuses an entry (src/brand/VOICE.md, "Interface copy"). */
export const LEDGER_MESSAGES = {
  changed: 'A consent record never changes. To end a consent, record its withdrawal.',
  deleted: 'Consent records are kept: they cannot be deleted.',
  person: 'Choose the person who gave this consent.',
  notice: 'Choose the notice the person saw.',
  noGrant: 'Choose the consent that is being withdrawn.',
  notAGrant: 'Choose the consent itself, not an earlier withdrawal.',
  alreadyWithdrawn: 'This consent has already been withdrawn.',
  givenWithdrawn: 'Record the consent first, then its withdrawal as an entry of its own.',
  deletedOnly: 'This applies only to the consents of a deleted record.',
  future: 'That time has not come yet: enter when it happened.',
  beforeGrant: 'A consent cannot be withdrawn before it was given.',
  notInForce: 'This notice was not in force at that time: choose the one the person saw.',
  otherPurpose: 'This notice is for another purpose.',
  evidence: 'Say where the reply is kept, such as the file name of the saved email or screenshot.',
} as const

/** Staff enter times to the minute: a time up to five minutes ahead of the server still counts. */
const CLOCK_GRACE_MS = 5 * 60 * 1000

/** The id a relationship holds, whether it came as the id itself or populated. */
export function idOf(value: unknown): number | string | null {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id: unknown }).id
    return typeof id === 'number' || typeof id === 'string' ? id : null
  }
  return null
}

const sameId = (a: unknown, b: unknown) => {
  const left = idOf(a)
  const right = idOf(b)
  return left !== null && right !== null && String(left) === String(right)
}

/** Whether an entry records a withdrawal rather than a consent. */
export function isWithdrawal(entry: Pick<LedgerEntry, 'withdraws'>): boolean {
  return idOf(entry.withdraws) !== null
}

/** The consents nothing withdraws yet. */
export function activeGrants<T extends LedgerEntry>(entries: T[]): T[] {
  return entries.filter(
    (entry) => !isWithdrawal(entry) && !entries.some((other) => sameId(other.withdraws, entry.id)),
  )
}

/**
 * Where a person stands on one purpose: the consent they gave last decides, and it counts only
 * while no entry withdraws it. An earlier consent that a later one replaced (given again under a
 * newer notice) is superseded, not still in force.
 */
export function consentState(entries: LedgerEntry[], purpose: string): ConsentState {
  const grants = entries
    .filter((entry) => entry.purpose === purpose && !isWithdrawal(entry))
    .sort(
      (a, b) =>
        Date.parse(b.grantedAt) - Date.parse(a.grantedAt) ||
        String(b.id).localeCompare(String(a.id), 'en', { numeric: true }),
    )
  const newest = grants[0]
  if (!newest) return 'none'
  return entries.some((entry) => sameId(entry.withdraws, newest.id)) ? 'withdrawn' : 'granted'
}

/** A time staff or a form gave, as a date; null when there is none or it is not a date. */
function asDate(value: unknown): Date | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Whether a time lies ahead of now, beyond the grace for a clock or a picker that rounds up. */
export function isFuture(value: unknown, now: Date): boolean {
  const date = asDate(value)
  return date !== null && date.getTime() > now.getTime() + CLOCK_GRACE_MS
}

/** Whether a notice was in force at a time: it took effect then or before. */
export function inForceAt(effectiveFrom: unknown, at: unknown): boolean {
  const from = asDate(effectiveFrom)
  const when = asDate(at)
  return from !== null && when !== null && from.getTime() <= when.getTime()
}

/** Whether a withdrawal time comes before the consent it withdraws. */
export function isBefore(value: unknown, reference: unknown): boolean {
  const date = asDate(value)
  const other = asDate(reference)
  return date !== null && other !== null && date.getTime() < other.getTime()
}

/**
 * Whether a consent needs evidence named: one given through a form on the site carries its own
 * (the address, the browser and the form, recorded by the server); one given any other way is
 * recorded by staff, who say where the reply is kept (docs/08 §3: consent must be provable).
 */
export function needsEvidence(entry: { channel?: unknown; withdraws?: unknown }): boolean {
  return !isWithdrawal(entry) && typeof entry.channel === 'string' && entry.channel !== 'web'
}
