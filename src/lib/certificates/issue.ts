import {
  commitTransaction,
  initTransaction,
  killTransaction,
  type PayloadRequest,
  ValidationError,
} from 'payload'
import { z } from 'zod'

import { type AdminView, viewRefusal } from '@/access/views'
import { recordAudit } from '@/lib/audit/record'
import { err, ok, type Result } from '@/lib/result'
import { IST, istDay } from '@/lib/time/ist'
import type { Certificate } from '@/payload-types'

import {
  type CertificateError,
  type CertificatePreview,
  type CertificateStore,
  type IssuedCertificate,
  issueInput,
  type ReissueCertificate,
  reissueInput,
  type RenderCertificatePdf,
  type RevokeCertificate,
  revokeInput,
  type IssueCertificates,
  type PreviewCertificates,
} from './contract'
import type { EmitCertificateEvent } from './events'
import { formatCertificateId, parseCertificateId } from './ids'
import { qrSvg } from './qr'
import { pdfKeyFor } from './store'
import {
  fillCertificate,
  type Signatory,
  signatoryFrom,
  SIGNATORY_INPUT,
  STATEMENT_INPUT,
} from './template'
import { hashVerifyToken, sha256Hex, VERIFY_PATH, verifyUrl } from './token'

/**
 * Issuing, revoking and reissuing certificates (docs/18 §4; D-39). Each act checks the user, an
 * active account, the two-factor code and the role first (`viewRefusal`), before it reads its
 * input (CLAUDE.md #6); reads with the user's own access; and writes the certificate past the
 * collection's rules, which let no role write one through the API. Every write is in the audit log
 * under its own name, in the same transaction; a download writes `download-certificate` before
 * the file is handed over.
 *
 * An issue makes everything first (the next IDs of the year, a token each, the QR code, the page,
 * the PDF), then in one transaction creates the rows, raises C5's event and stores the PDFs; a
 * failure anywhere rolls the batch back. Two issues at once may reach for the same number: the
 * unique ID refuses the second, which starts again from the new highest number.
 */

export type CertificateDeps = {
  /** Where the PDFs go; `storage-missing` on a deployment without the private bucket. */
  store: () => Result<CertificateStore, { code: 'storage-missing' }>
  /** HTML to PDF (M3's renderer, src/lib/pdf), or null where it is not wired. */
  render: RenderCertificatePdf | null
  /** The filled page made self-contained (the kit's styles and fonts inside it) for printing. */
  selfContain: (html: string) => Promise<string>
  /** The kit's certificate template. */
  template: () => Promise<string>
  /** This deployment's origin, which the QR code's link starts with. */
  siteUrl: () => string
  now: () => Date
  /** A fresh 128-bit verify token in base64url. */
  newToken: () => string
  /** A batch id shared by one issue's certificates. */
  newBatch: () => string
  emit: EmitCertificateEvent
}

/** What the preview shows where the ID and the link will be: they are made on issue. */
export const PREVIEW_ID = 'Preview: the ID is given on issue'

/** At most this many pages are drawn for a preview; every recipient prints the same way. */
export const PREVIEW_LIMIT = 10

/** How often an issue starts again after another issue took its numbers. */
const ATTEMPTS = 3

const refused = (user: unknown, view: AdminView): CertificateError | null => {
  const refusal = viewRefusal(user, view)
  return refusal ? { code: 'refused', refusal } : null
}

const invalid = (error: z.ZodError): CertificateError => ({
  code: 'invalid',
  issues: error.issues.map((issue) =>
    issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
  ),
})

/** The year of issue: the year in India at the moment of issue. */
const yearOf = (instant: Date): number => Number(istDay(instant).slice(0, 4))

/** Runs a write under an audit action of its own name, then puts the old one back. */
async function underAction<T>(req: PayloadRequest, action: string, write: () => Promise<T>) {
  const previous = req.context.auditAction
  req.context.auditAction = action
  try {
    return await write()
  } finally {
    req.context.auditAction = previous
  }
}

async function signatoryOf(req: PayloadRequest): Promise<Signatory | null> {
  const settings = await req.payload.findGlobal({
    slug: 'settings',
    depth: 0,
    overrideAccess: true,
    req,
  })
  return signatoryFrom(settings.certificates)
}

/** The highest number issued in a year so far (0 for none). */
async function highestOf(req: PayloadRequest, year: number): Promise<number> {
  const { docs } = await req.payload.find({
    collection: 'certificates',
    where: { certificateId: { like: `IIIC-C-${year}-` } },
    select: { certificateId: true },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return docs.reduce(
    (highest, doc) => Math.max(highest, parseCertificateId(doc.certificateId)?.sequence ?? 0),
    0,
  )
}

/** Whether a failed create lost the race for its ID (the unique index refused it). */
function isIdClash(error: unknown): boolean {
  if (error instanceof ValidationError) {
    return error.data.errors.some(({ path }) => path === 'certificateId')
  }
  const text = error instanceof Error ? `${error.message} ${String(error.cause ?? '')}` : ''
  return /unique|duplicate/i.test(text) && /certificate_id|certificateId/i.test(text)
}

type Printed = {
  nameAsPrinted: string
  programmeName: string
  programmeDetails?: string | null
  completedOn: string
}

type Draft = Printed & {
  personId: number
  certificateId: string
  verifyTokenHash: string
  pdf: Uint8Array
  pdfKey: string
  pdfSha256: string
}

type Ready = {
  signatory: Signatory
  store: CertificateStore
  render: RenderCertificatePdf
}

export function makeCertificateActions(deps: CertificateDeps) {
  /** What an issue needs before anything is made: the signatory, the store, the renderer. */
  async function readiness(req: PayloadRequest): Promise<Result<Ready, CertificateError>> {
    const signatory = await signatoryOf(req)
    if (!signatory) return err({ code: 'signatory-missing' })
    const store = deps.store()
    if (!store.ok) return store
    if (!deps.render) return err({ code: 'render-failed' })
    return ok({ signatory, store: store.value, render: deps.render })
  }

  /** One certificate made, not stored: its ID, its token's hash, its PDF. */
  async function draft(
    ready: Ready,
    template: string,
    issuedAt: Date,
    certificateId: string,
    personId: number,
    printed: Printed,
  ): Promise<Draft | null> {
    const token = deps.newToken()
    const url = verifyUrl(deps.siteUrl(), token)
    const { html } = fillCertificate(template, {
      certificateId,
      issuedAt,
      nameAsPrinted: printed.nameAsPrinted,
      programmeName: printed.programmeName,
      programmeDetails: printed.programmeDetails,
      signatory: ready.signatory,
      verifyUrl: url,
      qrSvg: await qrSvg(url),
    })
    let pdf: Uint8Array
    try {
      pdf = await ready.render(await deps.selfContain(html))
    } catch {
      return null
    }
    return {
      ...printed,
      personId,
      certificateId,
      verifyTokenHash: hashVerifyToken(token),
      pdf,
      pdfKey: pdfKeyFor(certificateId),
      pdfSha256: sha256Hex(pdf),
    }
  }

  const rowOf = (
    req: PayloadRequest,
    made: Draft,
    issuedAt: Date,
    batch: string,
    replaces?: number,
  ) => ({
    certificateId: made.certificateId,
    status: 'valid' as const,
    person: made.personId,
    nameAsPrinted: made.nameAsPrinted,
    programmeName: made.programmeName,
    programmeDetails: made.programmeDetails ?? undefined,
    completedOn: made.completedOn,
    issuedAt: issuedAt.toISOString(),
    issuedAt_tz: IST,
    issuedBy: (req.user as { id: number }).id,
    batch,
    verifyTokenHash: made.verifyTokenHash,
    pdfKey: made.pdfKey,
    pdfSha256: made.pdfSha256,
    ...(replaces === undefined ? {} : { replaces }),
  })

  /**
   * Makes and stores a run of certificates numbered from the year's highest + 1, in one
   * transaction; `before` runs first inside it (a reissue revokes the old one there). 'clash'
   * when another issue took a number first: nothing is kept, and the caller starts again.
   */
  async function issueRun(
    req: PayloadRequest,
    ready: Ready,
    people: { personId: number; printed: Printed }[],
    options: { action: string; replaces?: number; before?: () => Promise<void> },
  ): Promise<Result<IssuedCertificate[], CertificateError> | 'clash'> {
    const issuedAt = deps.now()
    const year = yearOf(issuedAt)
    const first = (await highestOf(req, year)) + 1
    const template = await deps.template()
    const drafts: Draft[] = []
    for (const [index, { personId, printed }] of people.entries()) {
      const made = await draft(
        ready,
        template,
        issuedAt,
        formatCertificateId(year, first + index),
        personId,
        printed,
      )
      if (!made) return err({ code: 'render-failed' })
      drafts.push(made)
    }

    const batch = deps.newBatch()
    const owned = await initTransaction(req)
    try {
      if (options.before) await options.before()
      const issued: IssuedCertificate[] = []
      for (const made of drafts) {
        const doc = await underAction(req, options.action, () =>
          req.payload.create({
            collection: 'certificates',
            data: rowOf(req, made, issuedAt, batch, options.replaces),
            depth: 0,
            overrideAccess: true,
            req,
          }),
        )
        issued.push({ id: doc.id, certificateId: doc.certificateId })
        await deps.emit(req, { name: 'certificate.issued', certificateId: doc.id })
      }
      for (const made of drafts) await ready.store.put(made.pdfKey, made.pdf)
      if (owned) await commitTransaction(req)
      return ok(issued)
    } catch (error) {
      if (owned) await killTransaction(req)
      if (owned && isIdClash(error)) return 'clash'
      throw error
    }
  }

  async function issueWithRetries(
    req: PayloadRequest,
    ready: Ready,
    people: { personId: number; printed: Printed }[],
    options: { action: string; replaces?: number; before?: () => Promise<void> },
  ): Promise<Result<IssuedCertificate[], CertificateError>> {
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      const result = await issueRun(req, ready, people, options)
      if (result !== 'clash') return result
    }
    throw new Error('Certificate numbers kept clashing; nothing was issued.')
  }

  /** The people of an issue, each one readable by the user; the IDs of any that are not. */
  async function missingPeople(req: PayloadRequest, ids: number[]): Promise<number[]> {
    const { docs } = await req.payload.find({
      collection: 'people',
      where: { id: { in: ids } },
      select: { createdAt: true },
      pagination: false,
      depth: 0,
      overrideAccess: false,
      req,
    })
    const found = new Set(docs.map((doc) => doc.id))
    return ids.filter((id) => !found.has(id))
  }

  const preview: PreviewCertificates = async (req, input) => {
    const refusal = refused(req.user, 'certificatesIssue')
    if (refusal) return err(refusal)
    const parsed = issueInput.safeParse(input)
    if (!parsed.success) return err(invalid(parsed.error))
    const signatory = await signatoryOf(req)
    const template = await deps.template()
    const issuedAt = deps.now()
    const link = `${deps.siteUrl().replace(/\/+$/, '')}${VERIFY_PATH}`
    const qr = await qrSvg(link)
    const pages: CertificatePreview[] = []
    for (const recipient of parsed.data.recipients.slice(0, PREVIEW_LIMIT)) {
      const { html, waitingFor } = fillCertificate(template, {
        certificateId: PREVIEW_ID,
        issuedAt,
        nameAsPrinted: recipient.nameAsPrinted,
        programmeName: parsed.data.programmeName,
        programmeDetails: parsed.data.programmeDetails,
        signatory,
        verifyUrl: `${link} (preview: each certificate gets its own link on issue)`,
        qrSvg: qr,
      })
      pages.push({
        html: await deps.selfContain(html),
        waitingFor: [...waitingFor, STATEMENT_INPUT],
      })
    }
    return ok(pages)
  }

  const issue: IssueCertificates = async (req, input) => {
    const refusal = refused(req.user, 'certificatesIssue')
    if (refusal) return err(refusal)
    const parsed = issueInput.safeParse(input)
    if (!parsed.success) return err(invalid(parsed.error))
    const ids = parsed.data.recipients.map(({ personId }) => personId)
    if (new Set(ids).size !== ids.length) {
      return err({ code: 'invalid', issues: ['recipients: a person is listed twice.'] })
    }
    const ready = await readiness(req)
    if (!ready.ok) return ready
    const missing = await missingPeople(req, ids)
    if (missing.length) return err({ code: 'person-not-found', personIds: missing })
    const { programmeName, programmeDetails, completedOn } = parsed.data
    return issueWithRetries(
      req,
      ready.value,
      parsed.data.recipients.map(({ personId, nameAsPrinted }) => ({
        personId,
        printed: { nameAsPrinted, programmeName, programmeDetails, completedOn },
      })),
      { action: 'issue-certificate' },
    )
  }

  /** The certificate as the user may read it, or null. */
  const readable = (req: PayloadRequest, id: number) =>
    req.payload.findByID({
      collection: 'certificates',
      id,
      depth: 0,
      disableErrors: true,
      overrideAccess: false,
      req,
    }) as Promise<Certificate | null>

  const revocationOf = (req: PayloadRequest, reason: string) => ({
    status: 'revoked' as const,
    revocation: {
      at: deps.now().toISOString(),
      at_tz: IST,
      by: (req.user as { id: number }).id,
      reason,
    },
  })

  const revoke: RevokeCertificate = async (req, input) => {
    const refusal = refused(req.user, 'certificatesRevoke')
    if (refusal) return err(refusal)
    const parsed = revokeInput.safeParse(input)
    if (!parsed.success) return err(invalid(parsed.error))
    const owned = await initTransaction(req)
    try {
      const current = await readable(req, parsed.data.certificateId)
      if (!current || current.status === 'revoked') {
        if (owned) await killTransaction(req)
        return err({ code: current ? 'already-revoked' : 'not-found' })
      }
      await underAction(req, 'revoke-certificate', () =>
        req.payload.update({
          collection: 'certificates',
          id: current.id,
          data: revocationOf(req, parsed.data.reason),
          depth: 0,
          overrideAccess: true,
          req,
        }),
      )
      if (owned) await commitTransaction(req)
      return ok({ id: current.id })
    } catch (error) {
      if (owned) await killTransaction(req)
      throw error
    }
  }

  const reissue: ReissueCertificate = async (req, input) => {
    const refusal = refused(req.user, 'certificatesRevoke')
    if (refusal) return err(refusal)
    const parsed = reissueInput.safeParse(input)
    if (!parsed.success) return err(invalid(parsed.error))
    const old = await readable(req, parsed.data.certificateId)
    if (!old) return err({ code: 'not-found' })
    if (old.status === 'revoked') return err({ code: 'already-revoked' })
    const ready = await readiness(req)
    if (!ready.ok) return ready
    const personId = typeof old.person === 'object' ? old.person.id : old.person
    const printed: Printed = {
      nameAsPrinted: parsed.data.nameAsPrinted ?? old.nameAsPrinted,
      programmeName: parsed.data.programmeName ?? old.programmeName,
      programmeDetails: parsed.data.programmeDetails ?? old.programmeDetails,
      completedOn: parsed.data.completedOn ?? old.completedOn,
    }
    const issued = await issueWithRetries(req, ready.value, [{ personId, printed }], {
      action: 'reissue-certificate',
      replaces: old.id,
      // The old one is revoked in the same transaction, only if it is still valid there.
      before: async () => {
        const { docs } = await underAction(req, 'reissue-certificate', () =>
          req.payload.update({
            collection: 'certificates',
            where: { and: [{ id: { equals: old.id } }, { status: { equals: 'valid' } }] },
            data: revocationOf(req, parsed.data.reason),
            depth: 0,
            overrideAccess: true,
            req,
          }),
        )
        if (docs.length !== 1) throw new AlreadyRevoked()
      },
    }).catch((error: unknown) => {
      if (error instanceof AlreadyRevoked) return err({ code: 'already-revoked' } as const)
      throw error
    })
    if (!issued.ok) return issued
    const [made] = issued.value
    if (!made) throw new Error('A reissue made no certificate.')
    return ok(made)
  }

  const downloadId = z.coerce.number().int().positive()

  /**
   * A certificate's PDF for the office (owner, operator): read with the user's access, checked
   * against the SHA-256 kept at issue, and recorded as `download-certificate` before it is
   * handed over, so a download the log could not record does not happen.
   */
  async function download(
    req: PayloadRequest,
    id: unknown,
  ): Promise<Result<{ certificateId: string; pdf: Uint8Array }, CertificateError>> {
    const refusal = refused(req.user, 'certificatesIssue')
    if (refusal) return err(refusal)
    const parsed = downloadId.safeParse(id)
    if (!parsed.success) return err({ code: 'not-found' })
    const certificate = await readable(req, parsed.data)
    if (!certificate?.pdfKey) return err({ code: 'not-found' })
    const store = deps.store()
    if (!store.ok) return store
    const pdf = await store.value.get(certificate.pdfKey)
    if (!pdf || (certificate.pdfSha256 && sha256Hex(pdf) !== certificate.pdfSha256)) {
      return err({ code: 'not-found' })
    }
    await recordAudit(req, {
      action: 'download-certificate',
      entity: 'certificates',
      entityId: certificate.id,
    })
    return ok({ certificateId: certificate.certificateId, pdf })
  }

  return { preview, issue, revoke, reissue, download }
}

class AlreadyRevoked extends Error {}

export type CertificateActions = ReturnType<typeof makeCertificateActions>

/** The inputs the issue screen shows as still missing, by input ID, before any preview. */
export const ISSUE_WAITS_ON = { signatory: SIGNATORY_INPUT, statement: STATEMENT_INPUT } as const
