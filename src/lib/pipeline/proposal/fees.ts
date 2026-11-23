import type { Paise } from '@/lib/payments/money'

import type { MayPrintFees } from '../proposals'

/**
 * The fees rule (docs/17 §5), in one place. D-21 keeps every price off every page, email and
 * template while `prices_public` is off, and the owner ruled on 23 November 2026 that no fee
 * prints anywhere while it is, proposals included. So this answers whether a proposal's fees
 * section prints: only while prices are public. With prices hidden a proposal is still made,
 * previewed, printed, sent and tracked, with its fees section left out entirely (no amount, no
 * total, nothing in its place); a version needs fees typed only when they will print. Every
 * action that makes a version, previews, prints or sends asks this function, and nothing else
 * decides. The proposal email never carries an amount, whatever this answers
 * (src/lib/pipeline/proposals.ts, ProposalMailer).
 */
export const mayPrintFees: MayPrintFees = (flags) => flags.pricesPublic

/**
 * The fees' total, before GST, worked out on the server (CLAUDE.md #5): whole paise only. A fee
 * that is not a whole, non-negative number of paise is a fault in the data, not an answer.
 */
export function feeTotalPaise(fees: readonly { amountPaise: Paise }[] | null | undefined): Paise {
  let total = 0
  for (const fee of fees ?? []) {
    if (!Number.isSafeInteger(fee.amountPaise) || fee.amountPaise < 0) {
      throw new RangeError('A fee must be a whole, non-negative number of paise')
    }
    total += fee.amountPaise
  }
  if (!Number.isSafeInteger(total)) throw new RangeError('The fees add up past a safe number')
  return total
}
