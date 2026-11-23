import { z } from 'zod'

/**
 * What builder C's tasks answer (docs/19 §2): how many messages they planned through the core and,
 * when they planned none, why, as a code. A job's output is read in the admin and by O3, so it
 * holds counts and codes only, never an address, a name or a body.
 */
export type Outcome = { planned: number; reason?: string }

export const done = (planned: number, reason?: string): Outcome =>
  reason ? { planned, reason } : { planned }

/** A record id in a job's input, checked at the boundary (an event carries ids only). */
export const RecordId = z.coerce.number().int().positive()

/** The output schema every one of C's tasks declares (Payload stores it with the job). */
export const OUTCOME_SCHEMA = [
  { name: 'planned', type: 'number' as const, required: true },
  { name: 'reason', type: 'text' as const },
]
