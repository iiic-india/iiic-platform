import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { AdminViewServerProps, PayloadRequest } from 'payload'

import { mayOpen, viewRefusal } from '@/access/views'
import { typedCertificateId } from '@/lib/certificates/ids'
import { certificateStoreFor } from '@/lib/certificates/store'
import { signatoryFrom } from '@/lib/certificates/template'
import { RENDERER_WIRED } from '@/lib/certificates/wiring'
import { env } from '@/lib/env'
import { formatIstDate } from '@/lib/time/ist'
import type { Certificate } from '@/payload-types'

import { CertificateActionForm } from './CertificateActionForm'
import { CERTIFICATES_COPY as COPY } from './certificatesCopy'
import styles from './Certificates.module.css'
import { IssueForm } from './IssueForm'

/** The admin path of this view, and of one certificate on it. */
export const ISSUE_PATH = '/certificates/issue'

/** How many of the latest certificates the view lists. */
const RECENT = 20

/** A day kept as YYYY-MM-DD in India time, as VOICE.md writes it. */
const dayText = (day: string) => formatIstDate(new Date(`${day}T12:00:00+05:30`))

/** A stored instant as its day in India time, or nothing when it is missing. */
const instantText = (instant: string | null | undefined) =>
  instant ? formatIstDate(new Date(instant)) : ''

/** What the screen still waits for before a first issue, in plain words with input IDs. */
async function waitsOf(req: PayloadRequest): Promise<{ lines: string[]; canIssue: boolean }> {
  const settings = await req.payload.findGlobal({
    slug: 'settings',
    depth: 0,
    overrideAccess: true,
    req,
  })
  const signatory = signatoryFrom(settings.certificates)
  const storage = certificateStoreFor(env()).ok
  const lines = [
    ...(signatory ? [] : [COPY.waitsSignatory]),
    COPY.waitsStatement,
    ...(storage ? [] : [COPY.waitsStorage]),
    ...(RENDERER_WIRED ? [] : [COPY.waitsRenderer]),
  ]
  return { lines, canIssue: Boolean(signatory) && storage && RENDERER_WIRED }
}

/** Events to add everyone booked on, read with the user's own access: the latest first. */
async function eventsOf(req: PayloadRequest) {
  const { docs } = await req.payload.find({
    collection: 'events',
    select: { title: true, startsAt: true },
    sort: '-startsAt',
    limit: 50,
    depth: 0,
    overrideAccess: false,
    req,
  })
  return docs.map((event) => ({
    id: event.id,
    label: event.startsAt
      ? `${event.title}, ${formatIstDate(new Date(event.startsAt))}`
      : event.title,
  }))
}

async function certificateNamed(req: PayloadRequest, typed: unknown): Promise<Certificate | null> {
  const parsed = typedCertificateId.safeParse(typeof typed === 'string' ? typed : '')
  if (!parsed.success) return null
  const { docs } = await req.payload.find({
    collection: 'certificates',
    where: { certificateId: { equals: parsed.data } },
    limit: 1,
    depth: 0,
    overrideAccess: false,
    req,
  })
  return docs[0] ?? null
}

/** One certificate for the office: its facts, the PDF, and an owner's revoke and reissue. */
function Record({
  certificate,
  adminRoute,
  isOwner,
}: {
  certificate: Certificate
  adminRoute: string
  isOwner: boolean
}) {
  const revoked = certificate.status === 'revoked'
  return (
    <section aria-labelledby="certificate-record" className={styles.panel}>
      <h2 id="certificate-record">
        {COPY.recordTitle}: {certificate.certificateId}
      </h2>
      <dl className={styles.facts}>
        <dt>{COPY.status}</dt>
        <dd>{revoked ? COPY.revokedStatus : COPY.valid}</dd>
        <dt>{COPY.nameAsPrinted}</dt>
        <dd>{certificate.nameAsPrinted}</dd>
        <dt>{COPY.programmeName}</dt>
        <dd>{certificate.programmeName}</dd>
        {certificate.programmeDetails ? (
          <>
            <dt>{COPY.details}</dt>
            <dd>{certificate.programmeDetails}</dd>
          </>
        ) : null}
        <dt>{COPY.completedOn}</dt>
        <dd>{dayText(certificate.completedOn)}</dd>
        <dt>{COPY.issuedOn}</dt>
        <dd>{instantText(certificate.issuedAt)}</dd>
        {revoked && certificate.revocation?.at ? (
          <>
            <dt>{COPY.revokedOn}</dt>
            <dd>{formatIstDate(new Date(certificate.revocation.at))}</dd>
            <dt>{COPY.reason}</dt>
            <dd>{certificate.revocation.reason}</dd>
          </>
        ) : null}
      </dl>
      {certificate.pdfKey ? (
        <p>
          <a download href={`/api/certificates/${certificate.id}/pdf`}>
            {COPY.download}
          </a>
        </p>
      ) : null}
      <p>
        <Link href={`${adminRoute}/collections/certificates/${certificate.id}`}>
          {COPY.openRecord}
        </Link>
      </p>
      {revoked ? <p className={styles.hint}>{COPY.alreadyRevokedNote}</p> : null}
      {!revoked && !isOwner ? <p className={styles.hint}>{COPY.revokeOwnersOnly}</p> : null}
      {!revoked && isOwner ? (
        <>
          <h3 id="certificate-revoke">{COPY.revokeTitle}</h3>
          <p className={styles.hint}>{COPY.revokeHint}</p>
          <CertificateActionForm
            confirmBody={COPY.revokeConfirm(certificate.certificateId)}
            confirmHeading={COPY.revokeConfirmTitle}
            labelledBy="certificate-revoke"
            path={`/api/certificates/${certificate.id}/revoke`}
            submitLabel={COPY.revoke}
          >
            <div className={styles.field}>
              <label className={styles.label} htmlFor="revoke-reason">
                {COPY.reason}
              </label>
              <textarea
                className={styles.input}
                id="revoke-reason"
                maxLength={1000}
                minLength={5}
                name="reason"
                required
                rows={3}
              />
            </div>
          </CertificateActionForm>

          <h3 id="certificate-reissue">{COPY.reissueTitle}</h3>
          <p className={styles.hint}>{COPY.reissueHint}</p>
          <CertificateActionForm
            confirmBody={COPY.reissueConfirm(certificate.certificateId)}
            confirmHeading={COPY.reissueConfirmTitle}
            labelledBy="certificate-reissue"
            path={`/api/certificates/${certificate.id}/reissue`}
            submitLabel={COPY.reissue}
          >
            <div className={styles.field}>
              <label className={styles.label} htmlFor="reissue-reason">
                {COPY.reason}
              </label>
              <textarea
                className={styles.input}
                id="reissue-reason"
                maxLength={1000}
                minLength={5}
                name="reason"
                required
                rows={3}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="reissue-name">
                {COPY.nameAsPrinted}
              </label>
              <input
                className={styles.input}
                id="reissue-name"
                maxLength={120}
                name="nameAsPrinted"
                placeholder={certificate.nameAsPrinted}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="reissue-programme">
                {COPY.programmeName}
              </label>
              <input
                className={styles.input}
                id="reissue-programme"
                maxLength={160}
                name="programmeName"
                placeholder={certificate.programmeName}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="reissue-details">
                {COPY.programmeDetails}
              </label>
              <input
                className={styles.input}
                id="reissue-details"
                maxLength={200}
                name="programmeDetails"
                placeholder={certificate.programmeDetails ?? undefined}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="reissue-completed">
                {COPY.completedOn}
              </label>
              <input
                className={styles.input}
                id="reissue-completed"
                name="completedOn"
                type="date"
              />
            </div>
          </CertificateActionForm>
        </>
      ) : null}
    </section>
  )
}

/**
 * Learning → Certificates → Issue (docs/18 §4, §6): issue singly or in bulk with a preview, and,
 * for one certificate (`?certificate=<ID>`), download its PDF and, for an owner, revoke or reissue
 * it. A custom view is public unless it checks for itself (CLAUDE.md #6): no session goes to the
 * sign-in, no code to the admin's start, which asks for it, and a role outside the office reads
 * nothing. Everything is then read with the user's own access.
 */
export async function CertificatesIssueView({
  initPageResult,
  params,
  searchParams,
}: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult
  const {
    routes: { admin: adminRoute },
    serverURL = '',
  } = req.payload.config
  const user = req.user
  if (!user) redirect(`${serverURL}${adminRoute}/login`)
  if ((user as { _strategy?: string })._strategy !== 'totp') redirect(`${serverURL}${adminRoute}`)

  const allowed = viewRefusal(user, 'certificatesIssue') === null
  const [waits, events, selected, recent] = allowed
    ? await Promise.all([
        waitsOf(req),
        eventsOf(req),
        certificateNamed(req, searchParams?.certificate),
        req.payload.find({
          collection: 'certificates',
          select: { certificateId: true, nameAsPrinted: true, status: true, issuedAt: true },
          sort: '-issuedAt',
          limit: RECENT,
          depth: 0,
          overrideAccess: false,
          req,
        }),
      ])
    : [null, [], null, null]

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      searchParams={searchParams}
      user={user}
      visibleEntities={visibleEntities}
    >
      <Gutter className={styles.view}>
        <h1>{COPY.title}</h1>
        {!allowed || !waits || !recent ? (
          <p>{COPY.notAllowed}</p>
        ) : (
          <>
            <p className={styles.intro}>{COPY.intro}</p>
            {selected ? (
              <Record
                adminRoute={adminRoute}
                certificate={selected}
                isOwner={mayOpen(user, 'certificatesRevoke')}
              />
            ) : null}
            <section aria-labelledby="certificates-waits" className={styles.panel}>
              <h2 id="certificates-waits">{COPY.waitsTitle}</h2>
              <ul className={styles.waits}>
                {waits.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="certificates-new" className={styles.panel}>
              <h2 id="certificates-new">{COPY.title}</h2>
              <IssueForm canIssue={waits.canIssue} events={events} />
            </section>
            <section aria-labelledby="certificates-recent" className={styles.panel}>
              <h2 id="certificates-recent">{COPY.recentTitle}</h2>
              {recent.docs.length === 0 ? (
                <p className={styles.hint}>{COPY.recentNone}</p>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">{COPY.certificateId}</th>
                      <th scope="col">{COPY.nameAsPrinted}</th>
                      <th scope="col">{COPY.status}</th>
                      <th scope="col">{COPY.issuedOn}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.docs.map((doc) => (
                      <tr key={doc.id}>
                        <th scope="row">
                          <Link
                            href={`${adminRoute}${ISSUE_PATH}?certificate=${encodeURIComponent(doc.certificateId)}`}
                          >
                            {doc.certificateId}
                          </Link>
                        </th>
                        <td data-label={COPY.nameAsPrinted}>{doc.nameAsPrinted}</td>
                        <td data-label={COPY.status}>
                          {doc.status === 'revoked' ? COPY.revokedStatus : COPY.valid}
                        </td>
                        <td data-label={COPY.issuedOn}>
                          {instantText(doc.issuedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </Gutter>
    </DefaultTemplate>
  )
}
