import type { Flags } from '@/lib/settings/flags'

import type { FlowType } from './details'

/**
 * What the review step shows and what follows it (docs/03 F3; docs/16 §8; D-21, D-24), pure:
 * - the total, with its GST, only while prices are published, and only the total the server
 *   computed (docs/08 §5: shown before payment and never grown afterwards);
 * - a payment step only when payment at booking is on and the session has a price; a call, an
 *   info session and a free option go straight to their confirmation.
 */

export type Quote = { totalPaise: number; taxPaise: number; taxablePaise: number; rate: number }

export type Review = {
  /** The total to show, or null: prices hidden, not a session, or no price set. */
  total: Quote | null
  /** Whether the next step is payment at booking. */
  pay: boolean
}

export function reviewFor(input: {
  type: FlowType
  flags: Pick<Flags, 'pricesPublic' | 'payAtBooking'>
  quote: Quote | null
}): Review {
  const priced = input.type === 'session' && input.quote !== null && input.quote.totalPaise > 0
  const total = input.flags.pricesPublic && priced ? input.quote : null
  return { total, pay: Boolean(total) && input.flags.payAtBooking }
}

/** Whole paise as rupees, as VOICE.md writes money: ₹1,500 or ₹1,500.50. */
export function formatRupees(paise: number): string {
  if (!Number.isInteger(paise) || paise < 0) throw new RangeError('Paise are a whole number.')
  const rupees = Math.floor(paise / 100)
  const rest = paise % 100
  const whole = new Intl.NumberFormat('en-IN').format(rupees)
  return rest === 0 ? `₹${whole}` : `₹${whole}.${String(rest).padStart(2, '0')}`
}

/** A GST rate in basis points as a percentage: 1800 is "18%", 1250 is "12.5%". */
export function formatRate(basisPoints: number): string {
  return `${Number((basisPoints / 100).toFixed(2))}%`
}

/**
 * The seconds a hold has left, never below zero (docs/08 §5: a timer only for a real hold, and
 * it never resets: it counts to the end the server set).
 */
export function holdSecondsLeft(holdExpiresAt: string | null, now: Date): number {
  if (!holdExpiresAt) return 0
  const left = Math.ceil((new Date(holdExpiresAt).getTime() - now.getTime()) / 1000)
  return Number.isFinite(left) && left > 0 ? left : 0
}

/** "9:05" for a timer, minutes and seconds. */
export function formatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
