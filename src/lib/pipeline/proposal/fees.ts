import type { Paise } from '@/lib/payments/money'

import type { MayPrintFees } from '../proposals'

/**
 * The fees rule (docs/17 §5, §10), in one place. D-21 keeps every price off every page, email
 * and template while `prices_public` is off. Whether a quote to one organisation stands outside
 * that rule, as a payment link's amount does (D-24), is IIIC's to decide; until it does, a
 * proposal's fees print only while prices are public, so its preview page and its PDF are
 * refused (`fees-hidden`) and nothing is sent. When IIIC rules, this function is the one edit:
 * every action that prints, previews or sends a proposal asks it, and nothing else decides.
 * The proposal email never carries an amount, whatever this answers (src/lib/pipeline/proposals.ts,
 * ProposalMailer).
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
