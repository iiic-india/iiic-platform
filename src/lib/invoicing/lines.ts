import { z } from 'zod'

import type { BasisPoints, Paise } from '@/lib/payments/money'
import { splitGstHeads, splitInclusive, stateCodeOfGstin } from '@/lib/payments/tax'
import { err, ok, type Result } from '@/lib/result'
import { CONTACT } from '@/lib/site/contact'

/**
 * What a document records (docs/16 §5): one line per booking, its all-in amount split into the
 * taxable value and the tax with the platform's own rules (src/lib/payments/tax.ts), the tax
 * divided into CGST and SGST within the supplier's state or IGST between states. Pure, so every
 * number the mirror keeps, Zoho is held to and the PDF prints comes from one place.
 *
 * The supplier's state is the first two digits of IIIC's GSTIN (Settings, I-05); while there is
 * none the heads cannot be worked out, and the document waits (docs/16 §10).
 */

export type MirrorLine = {
  description: string
  sacCode: string | null
  quantity: number
  gstRateBasisPoints: BasisPoints
  taxablePaise: Paise
  cgstPaise: Paise
  sgstPaise: Paise
  igstPaise: Paise
  totalPaise: Paise
}

export type MirrorTotals = Omit<
  MirrorLine,
  'description' | 'sacCode' | 'quantity' | 'gstRateBasisPoints'
>

export type LinesError = { code: 'supplier-gstin-missing' }

/** One line for an all-in amount, and the document's totals (one line, so the same). */
export function documentLine(input: {
  description: string
  sacCode: string | null
  totalPaise: Paise
  rate: BasisPoints
  supplierStateCode: string | null
  buyerStateCode: string | null
}): Result<{ line: MirrorLine; totals: MirrorTotals }, LinesError> {
  if (!input.supplierStateCode) return err({ code: 'supplier-gstin-missing' })
  const split = splitInclusive(input.totalPaise, input.rate)
  const heads = splitGstHeads(split.taxPaise, input.supplierStateCode, input.buyerStateCode)
  const totals: MirrorTotals = {
    taxablePaise: split.taxablePaise,
    ...heads,
    totalPaise: split.totalPaise,
  }
  return ok({
    line: {
      description: input.description,
      sacCode: input.sacCode,
      quantity: 1,
      gstRateBasisPoints: input.rate,
      ...totals,
    },
    totals,
  })
}

/** The tax a document's totals hold, all heads together. */
export const taxOf = (totals: MirrorTotals): Paise =>
  totals.cgstPaise + totals.sgstPaise + totals.igstPaise

/** A line's words: the service as IIIC names it, and the option booked. */
export function lineDescription(serviceName: string, optionLabel: string | null | undefined) {
  return optionLabel ? `${serviceName} · ${optionLabel}` : serviceName
}

/** The supplier's details a document prints, from the settings (src/globals/Settings.ts). */
export type SupplierDetails = {
  gstin: string | null
  stateCode: string | null
  udyam: string | null
  address: string | null
  email: string
  bank: {
    bankName: string | null
    accountName: string | null
    accountNumber: string | null
    ifsc: string | null
  }
}

const detail = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null),
  z.string().nullable(),
)

const SettingsShape = z.object({
  legal: z
    .object({
      gstin: detail,
      udyam: detail,
      address: detail,
      customerCare: z.object({ email: detail }).catch({ email: null }),
    })
    .catch({ gstin: null, udyam: null, address: null, customerCare: { email: null } }),
  bank: z
    .object({ bankName: detail, accountName: detail, accountNumber: detail, ifsc: detail })
    .catch({ bankName: null, accountName: null, accountNumber: null, ifsc: null }),
})

/** The supplier's details from the settings global as stored; empty fields are null. */
export function toSupplierDetails(settings: unknown): SupplierDetails {
  const parsed = SettingsShape.parse({ legal: undefined, bank: undefined, ...(settings ?? {}) })
  const { legal, bank } = parsed
  return {
    gstin: legal.gstin,
    stateCode: stateCodeOfGstin(legal.gstin),
    udyam: legal.udyam,
    address: legal.address,
    // The site's own address until the platform domain's exist (D-31, I-02).
    email: legal.customerCare.email ?? CONTACT.email,
    bank,
  }
}
