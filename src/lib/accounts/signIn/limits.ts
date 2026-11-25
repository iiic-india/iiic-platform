import { SIGN_IN_LIMITS } from '../contract'

/**
 * The code requests' limits (docs/20 §4.8; D-116), as a pure verdict on what the
 * `sign-in-requests` rows say: per address typed, one a minute, five an hour, ten a day; per
 * network address, twenty an hour; across the site, 120 in ten minutes. They count what was
 * typed, never whether it has an account, so "too many" tells nobody anything about one. A
 * refused request writes no row, so it counts for nothing.
 */

type Rule = { readonly count: number; readonly windowMs: number }

/** The longest window a rule looks back over, per kind: what the reader must fetch. */
export const LOOK_BACK = {
  identifier: Math.max(...SIGN_IN_LIMITS.perIdentifier.map((rule) => rule.windowMs)),
  network: Math.max(...SIGN_IN_LIMITS.perNetwork.map((rule) => rule.windowMs)),
  site: Math.max(...SIGN_IN_LIMITS.site.map((rule) => rule.windowMs)),
} as const

/** The most rows of one kind a rule can need to see. */
export const MOST_ROWS = {
  identifier: Math.max(...SIGN_IN_LIMITS.perIdentifier.map((rule) => rule.count)),
  network: Math.max(...SIGN_IN_LIMITS.perNetwork.map((rule) => rule.count)),
} as const

export type RequestTimes = {
  /** When the codes for this address went, newest first, over the last day. */
  identifier: readonly Date[]
  /** When the codes from this network address went, newest first, over the last hour; null
   * when the address is not known (a local server), which no rule can count by. */
  network: readonly Date[] | null
  /** How many codes went from anyone in the site's window. */
  site: number
}

export type LimitVerdict =
  { ok: true } | { ok: false; code: 'busy' } | { ok: false; code: 'too-many'; retryAt: Date }

/**
 * When a rule lets the next request through: the moment the oldest of the last `count` requests
 * inside its window leaves it; null when the rule is not reached.
 */
function freedAt(rule: Rule, times: readonly Date[], now: Date): Date | null {
  const within = times
    .filter((time) => now.getTime() - time.getTime() < rule.windowMs)
    .sort((a, b) => b.getTime() - a.getTime())
  if (within.length < rule.count) return null
  const oldest = within[rule.count - 1] as Date
  return new Date(oldest.getTime() + rule.windowMs)
}

/** The latest moment any reached rule frees, or null when none is reached. */
function latestFree(rules: readonly Rule[], times: readonly Date[], now: Date): Date | null {
  return rules.reduce<Date | null>((latest, rule) => {
    const free = freedAt(rule, times, now)
    return free && (!latest || free > latest) ? free : latest
  }, null)
}

export function limitVerdict(times: RequestTimes, now: Date): LimitVerdict {
  if (SIGN_IN_LIMITS.site.some((rule) => times.site >= rule.count))
    return { ok: false, code: 'busy' }
  const identifier = latestFree(SIGN_IN_LIMITS.perIdentifier, times.identifier, now)
  const network = times.network ? latestFree(SIGN_IN_LIMITS.perNetwork, times.network, now) : null
  const retryAt = [identifier, network].reduce<Date | null>(
    (latest, free) => (free && (!latest || free > latest) ? free : latest),
    null,
  )
  return retryAt ? { ok: false, code: 'too-many', retryAt } : { ok: true }
}
