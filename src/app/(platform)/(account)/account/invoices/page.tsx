import type { Metadata } from 'next'

import styles from '@/components/account/account.module.css'
import { INVOICES_COPY, titleOf } from '@/components/account/copy'
import { TableRegion } from '@/components/account/TableRegion'
import { listOwnInvoices } from '@/lib/accounts/documents'
import { accountRequest, openMyIiic } from '@/lib/accounts/scope'
import { formatRupees } from '@/lib/pdf/format'
import { formatIstDate } from '@/lib/time/ist'

export const metadata: Metadata = {
  title: titleOf(INVOICES_COPY.heading),
  robots: { index: false, follow: false },
}

/**
 * /account/invoices (docs/20 §7.4; D-118): the invoices and credit notes of the account's
 * bookings, with Zoho's number, the kind, the day and the status. While `prices_public` is off the
 * server sends no amount and no PDF (D-21, D-94, D-101), and the page says the PDF comes by reply
 * to the email it came with, as B3's receipt offers it. Once prices are public, the total shows
 * (two decimals, as invoices print it) and the PDF downloads through an audited route.
 */
export default async function InvoicesPage() {
  const account = await openMyIiic('/account/invoices')
  const invoices = await listOwnInvoices(await accountRequest(), account)
  const totals = invoices.some((invoice) => invoice.totalPaise !== null)
  const files = invoices.some((invoice) => invoice.downloadable)
  const byReply = invoices.some((invoice) => !invoice.downloadable)

  return (
    <div className={`iiic-page ${styles.page} ${styles.stack}`}>
      <div>
        <h1 className="iiic-marked">{INVOICES_COPY.heading}</h1>
        <p className="iiic-lede">{INVOICES_COPY.lede}</p>
      </div>
      {invoices.length ? (
        <>
          <TableRegion label={INVOICES_COPY.heading}>
            <table className="iiic-table">
              <thead>
                <tr>
                  <th scope="col">{INVOICES_COPY.columns.number}</th>
                  <th scope="col">{INVOICES_COPY.columns.kind}</th>
                  <th scope="col">{INVOICES_COPY.columns.date}</th>
                  <th scope="col">{INVOICES_COPY.columns.status}</th>
                  {totals ? <th scope="col">{INVOICES_COPY.columns.total}</th> : null}
                  {!files ? null : <th scope="col">{INVOICES_COPY.columns.actions}</th>}
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.number ?? INVOICES_COPY.noNumber}</td>
                    <td>{INVOICES_COPY.kind[invoice.kind] ?? invoice.kind}</td>
                    <td>{invoice.issuedOn ? formatIstDate(invoice.issuedOn) : ''}</td>
                    <td>{INVOICES_COPY.status[invoice.status] ?? invoice.status}</td>
                    {totals ? (
                      <td>
                        {invoice.totalPaise === null ? '' : `₹${formatRupees(invoice.totalPaise)}`}
                      </td>
                    ) : null}
                    {!files ? null : (
                      <td>
                        {invoice.downloadable ? (
                          <a
                            className="iiic-link"
                            href={`/account/invoices/${invoice.id}/pdf`}
                            download
                          >
                            {INVOICES_COPY.download}
                            <span className="iiic-sr-only">
                              {INVOICES_COPY.forNumber(invoice.number ?? String(invoice.id))}
                            </span>
                          </a>
                        ) : null}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableRegion>
          {byReply ? <p>{INVOICES_COPY.pdfByReply}</p> : null}
        </>
      ) : (
        <p>{INVOICES_COPY.empty}</p>
      )}
    </div>
  )
}
