import { randomInt } from 'node:crypto'

import type { BookingType } from './states'

/**
 * A booking's reference (docs/16 §6): `IIIC-` + S, C or I for its kind + `-` + five random
 * digits, such as IIIC-S-24117. People read it out on the phone, so it is short; it identifies a
 * booking and is never enough to read one (the manage link's token does that). Unique in the
 * database; a new one is drawn when it is already taken.
 */
export const REFERENCE = /^IIIC-[SCI]-\d{5}$/

const KIND_LETTER: Record<BookingType, 'S' | 'C' | 'I'> = { session: 'S', call: 'C', info: 'I' }

/** A fresh reference for a kind of booking, from the operating system's random numbers. */
export function newReference(
  type: BookingType,
  draw: (min: number, max: number) => number = randomInt,
): string {
  return `IIIC-${KIND_LETTER[type]}-${String(draw(0, 100_000)).padStart(5, '0')}`
}
