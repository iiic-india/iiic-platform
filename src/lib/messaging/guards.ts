/**
 * Last checks on a rendered message before it leaves (docs/19 §3, §7), pure so each has a test:
 * no price while the template's rule does not allow one (D-21, D-24), and no `[[TODO: …]]`
 * placeholder in what a client reads in production (CLAUDE.md #1).
 */

/** A rupee amount: the sign, "Rs" or "INR" beside a number. */
const PRICE = /₹|\bINR\s?\d|\bRs\.?\s?\d/i

export function showsPrice(...parts: readonly string[]): boolean {
  return parts.some((part) => PRICE.test(part))
}

export function hasPlaceholder(...parts: readonly string[]): boolean {
  return parts.some((part) => part.includes('[[TODO'))
}

/** The provider's id as the row keeps it: the fakes number per process, so the row's id joins in. */
export function storedProviderId(provider: string, providerMessageId: string, rowId: number) {
  return (provider === 'fake' ? `${providerMessageId}@${rowId}` : providerMessageId).slice(0, 128)
}
