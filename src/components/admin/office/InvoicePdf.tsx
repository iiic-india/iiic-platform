import type { UIFieldServerComponent } from 'payload'

import { viewRefusal } from '@/access/views'
import { isInvoicePdfKey } from '@/lib/invoicing/keys'

import styles from './Office.module.css'
import { INVOICE_PDF_COPY } from './officeViewCopy'

/**
 * On an invoice's page (D-88; M7): the link to its PDF for owners and finance with their code,
 * checked before the invoice is read; the download route checks again and writes the audit entry
 * (src/app/api/invoices/[id]/pdf/route.ts). Anyone else sees nothing here.
 */
export const InvoicePdf: UIFieldServerComponent = async ({ id, payload, req }) => {
  if (viewRefusal(req.user, 'invoicePdf')) return null
  if (id === undefined || id === null) return null
  const invoice = await payload.findByID({
    collection: 'invoices',
    id,
    depth: 0,
    select: { pdfKey: true },
    disableErrors: true,
    overrideAccess: false,
    req,
  })
  if (!invoice) return null
  if (!isInvoicePdfKey(invoice.pdfKey))
    return <p className={styles.hint}>{INVOICE_PDF_COPY.none}</p>
  const href = `${payload.config.routes.api}/invoices/${encodeURIComponent(String(id))}/pdf`
  return (
    <p>
      <a href={href} download>
        {INVOICE_PDF_COPY.download}
      </a>{' '}
      <span className={styles.hint}>{INVOICE_PDF_COPY.help}</span>
    </p>
  )
}
