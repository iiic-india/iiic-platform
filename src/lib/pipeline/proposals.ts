import type { PayloadRequest } from 'payload'

import type { Paise } from '@/lib/payments/money'
import type { Result } from '@/lib/result'
import type { Flags } from '@/lib/settings/flags'
import type { ProposalVersion } from '@/payload-types'

/**
 * Proposals from draft to answer (docs/17 §5), as contracts for builder C. Every word and fee is
 * typed by IIIC's staff; the platform adds only the reference, the date, the total and the client's
 * name, and never a price, a term or a validity of its own (CLAUDE.md #1). Printing goes through
 * M3's renderer (`proposalPage` and `renderProposalPdf` in src/lib/pdf/documents.ts, D-09), which
 * refuses a PDF that still holds a placeholder.
 */

/**
 * A version's frozen merge fields: what the kit's `print/proposal.html` prints, field for field
 * the renderer's `ProposalDocument` (src/lib/pdf/proposal.ts).
 */
export type ProposalSnapshot = {
  clientName: string
  title: string
  subtitle: string
  /** YYYY-MM-DD, the day in India the version was made. */
  date: string
  authorName: string
  authorTitle: string
  /** The proposal's reference and the version's number: IIIC-P-24117 v2. */
  reference: string
  situation: string
  approach: string
  phases: { name: string; what: string; duration: string; outcome: string }[]
  measures: string
  fees: { item: string; amountPaise: Paise }[]
  nextStep: string
}

/** Why a proposal action said no. */
export type ProposalError =
  | { code: 'not-found' }
  | { code: 'not-allowed' } // role, two-factor code, or fees changed by someone not an owner
  | { code: 'bad-move'; from: string; to: string } // not in PROPOSAL_MOVES
  | { code: 'incomplete'; missing: string[] } // a part the template prints is empty
  | { code: 'placeholders'; waitingFor: string[] } // the renderer's refusal, for a client copy
  | { code: 'no-recipient' } // the lead's contact has no email address
  | { code: 'not-sent' } // tracking or answering a version never sent
  | { code: 'link-closed' } // a withdrawn, replaced or answered version's link

/**
 * Whether a proposal's fees section prints. D-21 keeps every price off every page, email and
 * template while `prices_public` is off, and the owner ruled (23 November 2026) that proposals are
 * no exception: the answer is `flags.pricesPublic`. While it is false a proposal is still made,
 * previewed, printed, sent and tracked, and the renderer leaves its fees section out entirely.
 */
export type MayPrintFees = (flags: Pick<Flags, 'pricesPublic'>) => boolean

/**
 * Freezes the proposal as its next version (1, 2, 3): the snapshot, the server's fee total, who
 * made it; sets `currentVersion`; moves a sent, viewed or expired proposal back to draft; logs a
 * `proposal` activity; emits `proposal.versionCreated`. `incomplete` names the empty parts.
 */
export type CreateVersion = (
  req: PayloadRequest,
  input: { proposalId: number },
) => Promise<Result<ProposalVersion, ProposalError>>

/**
 * The filled page for the office to read before sending, placeholders shown as they are; nothing
 * is stored. Of the working copy (`proposalId`) or of a version (`versionId`).
 */
export type PreviewProposal = (
  req: PayloadRequest,
  input: { proposalId: number } | { versionId: number },
) => Promise<Result<{ html: string }, ProposalError>>

/** A version's PDF, as the client receives it: refused while a placeholder remains. */
export type PrintVersion = (
  req: PayloadRequest,
  input: { versionId: number },
) => Promise<Result<{ pdf: Uint8Array; filename: string; sha256: string }, ProposalError>>

/**
 * Sends a version to the lead's contact (docs/05 "Send a proposal"; P5; docs/17 §5). First, in
 * one transaction: prints it (refused with placeholders; the fees section only while fees may
 * print), records its SHA-256,
 * issues the tracked link (a token of 32 random bytes, kept only as its SHA-256), marks any
 * version sent before it as replaced (its link closes), sets the proposal `sent` with
 * `sentVersion`, moves a consultancy lead to Proposal sent if it is earlier, logs a `proposal`
 * activity, makes the follow-up task due in three working days (key `P5:version:<id>`) and emits
 * `proposal.sent`. Then, once that has committed, emails the link (ProposalMailer) and records
 * `emailedAt`. The token exists only in this call, so the email is sent here, not by a job; when
 * it fails the proposal stays sent, `mailed` is false, and the office copies the link shown once
 * or sends again, which issues a new link and closes the old. Owner or operator, with the code.
 */
export type SendVersion = (
  req: PayloadRequest,
  input: { versionId: number; by: number },
) => Promise<Result<{ linkUrl: string; mailed: boolean }, ProposalError>>

/**
 * The tracked link (`/p/[token]`): the version's PDF to whoever holds the token, while the
 * version is the one sent and the proposal is sent, viewed or accepted. Each opening of the PDF
 * counts; the first sets `firstViewedAt`, moves a sent proposal to viewed and emits
 * `proposal.viewed`. Anything else answers `link-closed`, which the page shows without saying why.
 */
export type OpenTrackedLink = (
  req: PayloadRequest,
  input: { token: string; now: Date },
) => Promise<Result<{ versionId: number; pdf: Uint8Array; filename: string }, ProposalError>>

/** What the client answered, recorded by the office: accepted or declined, with a note. */
export type RecordAnswer = (
  req: PayloadRequest,
  input: { proposalId: number; answer: 'accepted' | 'declined'; note?: string; by: number },
) => Promise<Result<{ proposalId: number }, ProposalError>>

/** P8 (proposed): sent or viewed proposals past their "valid until" day become expired. */
export type ExpireProposals = (req: PayloadRequest, now: Date) => Promise<number>

/**
 * The proposal email (P5): to one person, the reference in the subject, the tracked link as its
 * one button, and no amount (D-21 holds for email too, whatever MayPrintFees answers). Since M6
 * joined, the app's mailer sends it through the messaging core with the React Email template
 * `proposal-sent` and logs it in `messages` (src/lib/automations/pipeline/proposalMailer.ts);
 * the ids and the send's moment are what the log keys it by, one row per send. The port stays.
 */
export type ProposalMailer = (message: {
  to: string
  reference: string
  clientName: string
  linkUrl: string
  /** The lead's contact the version was sent to (`sending.sentTo`). */
  personId: number
  proposalId: number
  versionId: number
  /** When this send happened (`sending.sentAt`): a send again is a new message. */
  sentAt: string
}) => Promise<Result<{ messageId: string | null }, { code: 'mail-failed' }>>
