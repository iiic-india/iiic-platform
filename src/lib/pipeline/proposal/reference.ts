import { randomInt } from 'node:crypto'

/**
 * A proposal's reference (docs/17 §5, proposed): `IIIC-P-` and five digits, given by the
 * platform when the proposal is made, and printed with the version's number ("IIIC-P-24117 v2").
 * The digits are drawn at random rather than counted, so a reference says nothing about how many
 * proposals IIIC has made; the collection's unique index and the hook's retry keep them apart.
 */
export const REFERENCE_PREFIX = 'IIIC-P-'

/** What a reference looks like. */
export const REFERENCE = /^IIIC-P-\d{5}$/

const LOWEST = 10_000
const PAST_HIGHEST = 100_000

/** The reference for a five-digit number (10000 to 99999). */
export function referenceFor(digits: number): string {
  if (!Number.isInteger(digits) || digits < LOWEST || digits >= PAST_HIGHEST) {
    throw new RangeError('A reference has five digits, from 10000 to 99999')
  }
  return `${REFERENCE_PREFIX}${digits}`
}

/** A new reference, at random. `draw` is for the tests. */
export function newReference(draw: (min: number, max: number) => number = randomInt): string {
  return referenceFor(draw(LOWEST, PAST_HIGHEST))
}

/** A version's printed reference: the proposal's, with the version's number. */
export function versionReference(reference: string, number: number): string {
  return `${reference} v${number}`
}
