import type { CollectionBeforeChangeHook } from 'payload'

import type { Proposal } from '@/payload-types'

import { feeTotalPaise } from './fees'
import { newReference } from './reference'

/**
 * The proposals collection's own hooks (docs/17 §5): the platform gives the reference when a
 * proposal is made and works out the fees' total on every save, from the fees as they will be
 * stored (an operator's save keeps an owner's fees: the field's access drops theirs first). Both
 * fields are written by no role (src/collections/Proposals.ts).
 */

const ATTEMPTS = 8

export const giveReference: CollectionBeforeChangeHook<Proposal> = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation !== 'create' || data.reference || originalDoc?.reference) return data
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const reference = newReference()
    const { totalDocs } = await req.payload.count({
      collection: 'proposals',
      where: { reference: { equals: reference } },
      overrideAccess: true,
      req,
    })
    if (totalDocs === 0) return { ...data, reference }
  }
  // Practically unreachable with 90,000 references; the unique index is the last word.
  return { ...data, reference: newReference() }
}

export const workOutFeeTotal: CollectionBeforeChangeHook<Proposal> = ({ data, originalDoc }) => {
  const fees = data.fees === undefined ? originalDoc?.fees : data.fees
  try {
    return { ...data, feeTotalPaise: feeTotalPaise(fees) }
  } catch {
    // An amount that is not whole paise: the field's own check, which runs next, says so.
    return data
  }
}
