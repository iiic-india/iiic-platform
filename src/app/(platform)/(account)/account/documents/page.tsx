import type { Metadata } from 'next'
import Link from 'next/link'

import styles from '@/components/account/account.module.css'
import { DOCUMENTS_COPY, MY_IIIC_COPY_STATUS, titleOf } from '@/components/account/copy'
import { TableRegion } from '@/components/account/TableRegion'
import { CandidateMark } from '@/components/blocks/PageBlocks'
import { listOwnCertificates } from '@/lib/accounts/documents'
import { accountRequest, openMyIiic } from '@/lib/accounts/scope'
import { formatIstDate } from '@/lib/time/ist'

export const metadata: Metadata = {
  title: titleOf(DOCUMENTS_COPY.heading),
  robots: { index: false, follow: false },
}

/** "30 October 2026" for a day kept as YYYY-MM-DD, at noon in India. */
const dayOf = (day: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(day) ? formatIstDate(new Date(`${day}T12:00:00+05:30`)) : day

/**
 * /account/documents (docs/20 §7.3): the certificates of completion of every one of the
 * account's records, with the ID, the programme, the completion day and Valid or Revoked, a link
 * to the public verification page by ID, and the PDF of a valid one, downloaded through an
 * audited route. Proposals stay on their tracked link and are not listed yet (D-124). The words
 * are the certificate's own (docs/08 §7): never a degree or a diploma.
 */
export default async function DocumentsPage() {
  const account = await openMyIiic('/account/documents')
  const certificates = await listOwnCertificates(await accountRequest(account), account)

  return (
    <div className={`iiic-page ${styles.page} ${styles.stack}`}>
      <CandidateMark status={MY_IIIC_COPY_STATUS} />
      <div>
        <h1 className="iiic-marked">{DOCUMENTS_COPY.heading}</h1>
        <p className="iiic-lede">{DOCUMENTS_COPY.lede}</p>
      </div>
      {certificates.length ? (
        <TableRegion label={DOCUMENTS_COPY.heading}>
          <table className="iiic-table">
            <thead>
              <tr>
                <th scope="col">{DOCUMENTS_COPY.columns.id}</th>
                <th scope="col">{DOCUMENTS_COPY.columns.programme}</th>
                <th scope="col">{DOCUMENTS_COPY.columns.completed}</th>
                <th scope="col">{DOCUMENTS_COPY.columns.status}</th>
                <th scope="col">{DOCUMENTS_COPY.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {certificates.map((certificate) => (
                <tr key={certificate.id}>
                  <td>{certificate.certificateId}</td>
                  <td>{certificate.programmeName}</td>
                  <td>{dayOf(certificate.completedOn)}</td>
                  <td>{DOCUMENTS_COPY.status[certificate.status] ?? certificate.status}</td>
                  <td>
                    <span className={styles.cellLinks}>
                      {certificate.downloadable ? (
                        <a
                          className="iiic-link"
                          href={`/account/documents/certificates/${certificate.id}/pdf`}
                          download
                        >
                          {DOCUMENTS_COPY.download}
                          <span className="iiic-sr-only">
                            {DOCUMENTS_COPY.forId(certificate.certificateId)}
                          </span>
                        </a>
                      ) : null}
                      <Link
                        className="iiic-link"
                        href={`/institute/verify?id=${encodeURIComponent(certificate.certificateId)}`}
                        prefetch={false}
                      >
                        {DOCUMENTS_COPY.check}
                        <span className="iiic-sr-only">
                          {DOCUMENTS_COPY.forId(certificate.certificateId)}
                        </span>
                      </Link>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableRegion>
      ) : (
        <p>{DOCUMENTS_COPY.empty}</p>
      )}
    </div>
  )
}
