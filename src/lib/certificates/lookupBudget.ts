import { WriteBudget } from '@/lib/redirects/missingPages'

/**
 * The verify page's rate limit (docs/01, "rate-limited"; docs/18 §4; D-109): at most this many
 * lookups by typed ID a minute on one server. An ID is a year, a number and a check digit, so
 * IDs can be walked in order; the page shows only initials by ID (D-96), and this caps how fast
 * anyone can walk them through one server. Past it the page asks the reader to try again in a
 * minute and looks nothing up. A QR code's token is 128 random bits and cannot be walked, so its
 * page has no budget. Vercel's firewall rule on the path limits each address (docs/12 §5, launch).
 */
export const VERIFY_LOOKUPS_PER_MINUTE = 120

const lookups = new WriteBudget(VERIFY_LOOKUPS_PER_MINUTE)

/** Whether one more lookup by ID fits in this minute on this server; counts it if it does. */
export function takeLookUpById(): boolean {
  return lookups.take()
}
