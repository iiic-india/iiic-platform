import 'server-only'

import type { Payload } from 'payload'

import type { VerificationView, VerifyById, VerifyByToken } from './contract'
import { typedCertificateId, verifyToken } from './ids'
import { hashVerifyToken } from './token'
import { VERIFY_SELECT, verificationView, type VerifyRow } from './view'

/**
 * The public lookups behind /institute/verify (docs/18 §4): no session, so they read past the
 * collection's rules, but only the fields `VERIFY_SELECT` names, and only after the input has
 * passed its own check (Zod at the boundary): a token of the right shape, hashed before the
 * lookup, or an ID whose check digit holds. Anything else answers "not found" without a query.
 */

const NOT_FOUND: VerificationView = { found: false }

async function replacementOf(payload: Payload, id: number): Promise<string | null> {
  const { docs } = await payload.find({
    collection: 'certificates',
    where: { replaces: { equals: id } },
    limit: 1,
    depth: 0,
    pagination: false,
    select: { certificateId: true },
    overrideAccess: true,
  })
  return docs[0]?.certificateId ?? null
}

async function lookUp(
  payload: Payload,
  where: { verifyTokenHash: { equals: string } } | { certificateId: { equals: string } },
  by: 'token' | 'id',
): Promise<VerificationView> {
  const { docs } = await payload.find({
    collection: 'certificates',
    where,
    limit: 1,
    depth: 0,
    pagination: false,
    select: VERIFY_SELECT,
    overrideAccess: true,
  })
  const row = docs[0] as VerifyRow | undefined
  if (!row) return NOT_FOUND
  const replacedBy = row.status === 'revoked' ? await replacementOf(payload, row.id) : null
  return verificationView(row, { by, replacedBy })
}

export function makeVerify(payload: () => Promise<Payload>): {
  verifyByToken: VerifyByToken
  verifyById: VerifyById
} {
  return {
    async verifyByToken(token) {
      const parsed = verifyToken.safeParse(token)
      if (!parsed.success) return NOT_FOUND
      return lookUp(
        await payload(),
        { verifyTokenHash: { equals: hashVerifyToken(parsed.data) } },
        'token',
      )
    },
    async verifyById(typedId) {
      const parsed = typedCertificateId.safeParse(typedId)
      if (!parsed.success) return NOT_FOUND
      return lookUp(await payload(), { certificateId: { equals: parsed.data } }, 'id')
    },
  }
}
