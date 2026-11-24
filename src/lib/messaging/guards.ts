/**
 * Last checks on a rendered message before it leaves (docs/19 §3, §7), pure so each has a test:
 * no price while the template's rule does not allow one (D-21, D-24, D-111), and no `[[TODO: …]]`
 * placeholder in what a client reads in production (CLAUDE.md #1).
 */

/** A rupee amount: the sign, "Rs" or "INR" beside a number. */
const PRICE = /₹|\bINR\s?\d|\bRs\.?\s?\d/i

export function showsPrice(...parts: readonly string[]): boolean {
  return parts.some((part) => PRICE.test(part))
}

const oneSpace = (text: string) => text.replace(/\s+/g, ' ').trim()

/**
 * The parts with the person's own words taken out (D-111): an email that quotes a complaint as
 * recorded, or a review they wrote, shows words IIIC did not write as a price, so the price guard
 * reads the rest only. Spacing is made even first, as the plain-text part wraps long lines.
 */
export function withoutQuotes(
  parts: readonly string[],
  quotes: readonly string[],
): readonly string[] {
  const own = quotes.map(oneSpace).filter(Boolean)
  if (!own.length) return parts
  return parts.map((part) =>
    own.reduce((rest, quote) => rest.split(quote).join(' '), oneSpace(part)),
  )
}

export function hasPlaceholder(...parts: readonly string[]): boolean {
  return parts.some((part) => part.includes('[[TODO'))
}

/** The provider's id as the row keeps it: the fakes number per process, so the row's id joins in. */
export function storedProviderId(provider: string, providerMessageId: string, rowId: number) {
  return (provider === 'fake' ? `${providerMessageId}@${rowId}` : providerMessageId).slice(0, 128)
}
