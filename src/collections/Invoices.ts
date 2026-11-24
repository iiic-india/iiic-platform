import type { CollectionConfig, Field } from 'payload'

import { allow, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { basisPointsField, paiseField, wholeNumber } from '@/fields/numbers'
import { INVOICE_KINDS, INVOICE_STATUSES } from '@/lib/payments/states'
import { IST_FIELD } from '@/lib/time/ist'

const taxColumns = (): Field[] => [
  paiseField('taxablePaise', 'Taxable value'),
  paiseField('cgstPaise', 'CGST'),
  paiseField('sgstPaise', 'SGST'),
  paiseField('igstPaise', 'IGST'),
  paiseField('totalPaise', 'Total'),
]

/**
 * The mirror of a document Zoho Books issued (docs/04 `invoices`; D-13): Zoho Books is the system
 * of record and numbers the documents; this record keeps what the platform asked for and what came
 * back, so the booking, the client's record and Money can show it. Written by the server alone
 * (B3, and the credit note on a refund), each once per cause (`idempotencyKey`). What it records:
 * the kind, the buyer as they were at the time, each line with its SAC code and tax, the totals
 * in paise as the platform computed them, Zoho's id and number, and where its PDF is kept in the
 * private bucket. Amounts are computed on the server (CLAUDE.md #5) and must equal Zoho's.
 */
export const Invoices: CollectionConfig = {
  slug: 'invoices',
  labels: { singular: 'Invoice', plural: 'Invoices' },
  admin: {
    group: 'Money',
    useAsTitle: 'number',
    defaultColumns: ['number', 'kind', 'status', 'issuedAt', 'totals.totalPaise'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.invoices.read.roles),
  },
  access: {
    read: allow(POLICY.invoices.read),
    create: allow(POLICY.invoices.create),
    update: allow(POLICY.invoices.update),
    delete: allow(POLICY.invoices.delete),
  },
  defaultSort: '-createdAt',
  disableBulkEdit: true,
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'kind', type: 'select', required: true, options: [...INVOICE_KINDS] },
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'pending',
          index: true,
          options: [...INVOICE_STATUSES],
        },
        { name: 'number', type: 'text', maxLength: 40, index: true },
        { name: 'zohoId', type: 'text', label: 'Zoho Books id', unique: true, maxLength: 64 },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'booking', type: 'relationship', relationTo: 'bookings', index: true },
        { name: 'payment', type: 'relationship', relationTo: 'payments', index: true },
        { name: 'refund', type: 'relationship', relationTo: 'refunds' },
        {
          // The document a credit note or refund voucher answers.
          name: 'against',
          type: 'relationship',
          relationTo: 'invoices',
        },
      ],
    },
    {
      // The buyer as the document names them, copied at issue (an anonymised person later
      // leaves this record as it was issued: GST law keeps it, docs/04).
      name: 'buyer',
      type: 'group',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'name', type: 'text', maxLength: 200 },
            { name: 'gstin', type: 'text', label: 'GSTIN', maxLength: 15 },
            {
              // The two-digit GST state code of the place of supply.
              name: 'stateCode',
              type: 'text',
              label: 'State code',
              maxLength: 2,
            },
          ],
        },
        { name: 'address', type: 'textarea', maxLength: 500 },
      ],
    },
    {
      name: 'lines',
      type: 'array',
      labels: { singular: 'Line', plural: 'Lines' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'description', type: 'text', required: true, maxLength: 200 },
            { name: 'sacCode', type: 'text', label: 'SAC code', maxLength: 6 },
            {
              name: 'quantity',
              type: 'number',
              required: true,
              defaultValue: 1,
              min: 1,
              validate: wholeNumber('the quantity'),
            },
            basisPointsField('gstRateBasisPoints', 'GST rate', '18% is 1800.'),
          ],
        },
        { type: 'row', fields: taxColumns() },
      ],
    },
    { name: 'totals', type: 'group', fields: [{ type: 'row', fields: taxColumns() }] },
    {
      type: 'row',
      fields: [
        {
          name: 'issuedAt',
          type: 'date',
          label: 'Issued',
          timezone: IST_FIELD,
          admin: { date: { pickerAppearance: 'dayAndTime' } },
        },
        {
          // The PDF's key in the private documents bucket; served through a signed link.
          name: 'pdfKey',
          type: 'text',
          label: 'PDF',
          maxLength: 200,
        },
        {
          // A short code for Zoho's last refusal, for the office; retried by the job (B3).
          name: 'failureCode',
          type: 'text',
          maxLength: 100,
        },
      ],
    },
    {
      // One document per cause: `payment:<id>:taxInvoice`, `refund:<id>:creditNote`.
      name: 'idempotencyKey',
      type: 'text',
      required: true,
      unique: true,
      maxLength: 80,
    },
  ],
}
