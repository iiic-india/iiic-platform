import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import type { ViewRefusal } from '@/access/views'
import { isIstDay } from '@/fields/istDay'
import type { Result } from '@/lib/result'

import type { CertificateStatus } from './ids'

/**
 * The certificates module's contract (D-39; docs/18 §4). Builder B implements it in
 * src/lib/certificates/ (issue.ts, revoke.ts, verify.ts, pdf.ts, store.ts) and the public pages
 * under src/app/(platform)/(education)/institute/verify/. Every function that acts for staff checks
 * `viewRefusal` first (src/access/views.ts) and returns its refusal as an error; every act is in
 * the audit log under a name of its own (`issue-certificate`, `revoke-certificate`,
 * `reissue-certificate`, `download-certificate`).
 */

/** One recipient of an issue: an existing person and the name exactly as it should print. */
export const recipientInput = z.object({
  personId: z.number().int().positive(),
  nameAsPrinted: z.string().trim().min(1).max(120),
})

/** An issue, single or bulk (up to 200 at once), for one programme. */
export const issueInput = z.object({
  programmeName: z.string().trim().min(1).max(160),
  programmeDetails: z.string().trim().max(200).optional(),
  completedOn: z.string().refine(isIstDay, 'Enter the day as YYYY-MM-DD.'),
  recipients: z.array(recipientInput).min(1).max(200),
})
export type IssueInput = z.infer<typeof issueInput>

export const revokeInput = z.object({
  certificateId: z.number().int().positive(),
  reason: z.string().trim().min(5).max(1000),
})
export type RevokeInput = z.infer<typeof revokeInput>

/** A reissue corrects what printed (the name, the programme line, the date) under a new ID. */
export const reissueInput = revokeInput.extend({
  nameAsPrinted: z.string().trim().min(1).max(120).optional(),
  programmeName: z.string().trim().min(1).max(160).optional(),
  programmeDetails: z.string().trim().max(200).optional(),
  completedOn: z.string().refine(isIstDay, 'Enter the day as YYYY-MM-DD.').optional(),
})
export type ReissueInput = z.infer<typeof reissueInput>

export type CertificateError =
  | ({ code: 'refused' } & { refusal: ViewRefusal })
  | { code: 'invalid'; issues: string[] }
  /** The signatory's name or title is not in Settings yet (docs/18 §9). */
  | { code: 'signatory-missing' }
  /** No private bucket on a deployment (R2_BUCKET_PRIVATE): nothing is issued. */
  | { code: 'storage-missing' }
  | { code: 'person-not-found'; personIds: number[] }
  | { code: 'not-found' }
  | { code: 'already-revoked' }
  /** The PDF could not be made; nothing was issued (the whole batch rolls back). */
  | { code: 'render-failed' }

/** What the preview shows before anything is issued: the filled page, placeholders and all. */
export type CertificatePreview = {
  html: string
  /** The inputs the page still waits for, by input ID (a preview never issues). */
  waitingFor: string[]
}

export type IssuedCertificate = { id: number; certificateId: string }

/** What the verify pages show: never the revoke reason, never the person's contact details. */
export type VerificationView =
  | { found: false }
  | {
      found: true
      certificateId: string
      status: CertificateStatus
      /** The full name by the QR token; initials only by a typed ID (docs/18 §4, proposed). */
      name: string
      programmeName: string
      programmeDetails: string | null
      completedOn: string
      issuedOn: string
      revokedOn: string | null
      /** A reissue's new ID, when this one was replaced. */
      replacedBy: string | null
    }

/** The PDF's home: the private bucket on deployments, a local folder in development and CI. */
export interface CertificateStore {
  put(key: string, pdf: Uint8Array): Promise<void>
  get(key: string): Promise<Uint8Array | null>
}

/** HTML to PDF: src/lib/pdf's renderPdf (M3 documents, D-09), given by the wiring. */
export type RenderCertificatePdf = (html: string) => Promise<Uint8Array>

export type PreviewCertificates = (
  req: PayloadRequest,
  input: unknown,
) => Promise<Result<CertificatePreview[], CertificateError>>

/**
 * Issues every recipient's certificate in one transaction: the next IDs of the year, a token
 * each, the QR code (`qrcode`, server-side SVG) and the PDF, stored, then one audit entry per
 * certificate and the C5 event per certificate (M6 sends the email).
 */
export type IssueCertificates = (
  req: PayloadRequest,
  input: unknown,
) => Promise<Result<IssuedCertificate[], CertificateError>>

export type RevokeCertificate = (
  req: PayloadRequest,
  input: unknown,
) => Promise<Result<{ id: number }, CertificateError>>

/** Revokes the old certificate and issues its replacement in one transaction. */
export type ReissueCertificate = (
  req: PayloadRequest,
  input: unknown,
) => Promise<Result<IssuedCertificate, CertificateError>>

/** The public lookups; no session, rate-limited, noindex (D-67). */
export type VerifyByToken = (token: string) => Promise<VerificationView>
export type VerifyById = (typedId: string) => Promise<VerificationView>
