/**
 * Money rules (CLAUDE.md #5; docs/16 §5): every amount is a whole number of paise, every total and
 * every tax is worked out on the server, and no rate, price or threshold is written in code: they
 * come from the service, the price history and Settings. These are the contracts the payments
 * builder implements in this folder, pure and unit-tested first.
 */

/** Integer paise: ₹1,500 is 150000. Never a float, never rupees. */
export type Paise = number

/** A GST rate in basis points: 18% is 1800. From the service (I-29). */
export type BasisPoints = number

/** What an all-in price holds: the taxable value and the GST inside it. */
export type InclusiveSplit = { taxablePaise: Paise; taxPaise: Paise; totalPaise: Paise }

/**
 * Splits an all-in price into its taxable value and its GST (docs/08 §4: prices are stored as the
 * amount the client pays). The rounding rule is the CA's to confirm (docs/16 §10); until then:
 * taxable = total × 10000 / (10000 + rate), rounded half up to the paise, and tax = total −
 * taxable, so the two always add up to the total.
 */
export type SplitInclusive = (totalPaise: Paise, rate: BasisPoints) => InclusiveSplit

/** CGST and SGST within Gujarat, IGST between states (src/brand/templates/print/invoice.html). */
export type GstHeads = { cgstPaise: Paise; sgstPaise: Paise; igstPaise: Paise }

/**
 * Divides the GST between its heads by place of supply: the supplier's state is the first two
 * digits of IIIC's GSTIN (Settings), the buyer's from their address when given, else the
 * supplier's. Within a state, CGST and SGST are half each, the odd paise to CGST (to confirm
 * with the CA).
 */
export type SplitGstHeads = (
  taxPaise: Paise,
  supplierStateCode: string,
  buyerStateCode: string | null,
) => GstHeads

/**
 * What a booking costs, worked out on the server from the price in force (price history) and the
 * service's GST rate. Shown to the client only while prices_public is on (D-21), at step 1, and
 * never grows afterwards (docs/08 §5).
 */
export type PriceQuote = InclusiveSplit & {
  rate: BasisPoints
  sacCode: string | null
  priceHistoryId: number
}
