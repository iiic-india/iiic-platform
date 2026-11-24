/**
 * The key of a client's invoice or credit-note PDF in the private bucket (src/lib/invoicing/
 * store.ts): `invoices/<the mirror's id>.pdf` and nothing else, so no key reaches outside its
 * folder. Apart from the store so that the admin's link reads it without the storage client.
 */

const PDF_KEY = /^invoices\/[1-9]\d{0,9}\.pdf$/

/** The PDF's key in the store, from the mirror's id in `invoices`. */
export function invoicePdfKey(invoiceId: number): string {
  if (!Number.isSafeInteger(invoiceId) || invoiceId < 1) throw new RangeError('not an invoice id')
  return `invoices/${invoiceId}.pdf`
}

export function isInvoicePdfKey(key: unknown): key is string {
  return typeof key === 'string' && PDF_KEY.test(key)
}
