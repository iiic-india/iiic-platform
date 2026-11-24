import { istDay } from '@/lib/time/ist'
import type { Certificate } from '@/payload-types'

import type { VerificationView } from './contract'

/**
 * What a verify page shows of a certificate (docs/18 §4): the ID, the status, the name, the
 * programme, its details, the completion and issue days, and for a reissue the new ID. Never the
 * reason it was revoked, the person's contact details or the PDF. By the QR token (which only the
 * holder's PDF carries) the full name; by a typed ID, which anyone could guess in sequence, the
 * initials only (docs/18 §8, proposed).
 */

/** The fields a lookup reads; nothing else leaves the database for a public page. */
export const VERIFY_SELECT = {
  certificateId: true,
  status: true,
  nameAsPrinted: true,
  programmeName: true,
  programmeDetails: true,
  completedOn: true,
  issuedAt: true,
  revocation: { at: true },
} as const

export type VerifyRow = Pick<
  Certificate,
  | 'id'
  | 'certificateId'
  | 'status'
  | 'nameAsPrinted'
  | 'programmeName'
  | 'programmeDetails'
  | 'completedOn'
  | 'issuedAt'
> & { revocation?: { at?: string | null } | null }

/** A name as initials: "Example Learner" reads "E. L.". */
export function initials(name: string): string {
  return name
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => `${(Array.from(part)[0] ?? '').toLocaleUpperCase('en-IN')}.`)
    .join(' ')
}

const dayOf = (instant: string | null | undefined): string | null =>
  instant ? istDay(new Date(instant)) : null

export function verificationView(
  row: VerifyRow | null | undefined,
  options: { by: 'token' | 'id'; replacedBy: string | null },
): VerificationView {
  if (!row) return { found: false }
  const revoked = row.status === 'revoked'
  return {
    found: true,
    certificateId: row.certificateId,
    status: revoked ? 'revoked' : 'valid',
    name: options.by === 'token' ? row.nameAsPrinted : initials(row.nameAsPrinted),
    programmeName: row.programmeName,
    programmeDetails: row.programmeDetails?.trim() ? row.programmeDetails : null,
    completedOn: row.completedOn,
    issuedOn: dayOf(row.issuedAt) ?? row.completedOn,
    revokedOn: revoked ? dayOf(row.revocation?.at) : null,
    replacedBy: revoked ? options.replacedBy : null,
  }
}
