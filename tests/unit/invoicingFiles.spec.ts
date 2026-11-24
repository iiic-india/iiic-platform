// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  downloadInvoicePdf,
  INVOICE_DOWNLOAD_ANSWERS,
  invoiceFilename,
  messageOf,
  statusOf,
} from '@/lib/invoicing/download'
import {
  folderInvoiceFiles,
  invoiceFilesFor,
  invoicePdfKey,
  isInvoicePdfKey,
  memoryInvoiceFiles,
} from '@/lib/invoicing/store'

// The client's invoice PDFs in the private bucket (D-88; M7): one key shape and nothing else, a
// store per deployment (the bucket, a local folder off Vercel, none on Vercel without the bucket),
// and a download for owners and finance with their code, checked before the invoice is read and
// written to the audit log before the file is sent. Every id, number and byte is fake.

const PDF = new TextEncoder().encode('%PDF-1.4 fake invoice')
const NO_BUCKET = {
  R2_ACCOUNT_ID: undefined,
  R2_ACCESS_KEY_ID: undefined,
  R2_SECRET_ACCESS_KEY: undefined,
  R2_BUCKET_PRIVATE: undefined,
}

describe('an invoice PDF’s key', () => {
  it('is invoices/<id>.pdf for a positive whole id, and nothing else is accepted', () => {
    expect(invoicePdfKey(42)).toBe('invoices/42.pdf')
    expect(() => invoicePdfKey(0)).toThrow(RangeError)
    expect(() => invoicePdfKey(1.5)).toThrow(RangeError)
    expect(isInvoicePdfKey('invoices/42.pdf')).toBe(true)
    for (const key of [
      'invoices/0.pdf',
      'invoices/../certificates/2099/x.pdf',
      'certificates/2099/IIIC-C-2099-0001-9.pdf',
      'invoices/42.pdf.exe',
      'invoices/42',
      null,
      42,
    ]) {
      expect(isInvoicePdfKey(key), String(key)).toBe(false)
    }
  })
})

describe('the store', () => {
  let folder: string
  beforeAll(async () => {
    folder = await mkdtemp(path.join(tmpdir(), 'iiic-invoices-'))
  })
  afterAll(async () => rm(folder, { recursive: true, force: true }))

  it('keeps and gives back a PDF in memory and in a folder, refusing any other key', async () => {
    for (const files of [memoryInvoiceFiles(), folderInvoiceFiles(folder)]) {
      expect(await files.put('invoices/7.pdf', PDF)).toEqual({ ok: true, value: undefined })
      expect(await files.get('invoices/7.pdf')).toEqual(PDF)
      expect(await files.get('invoices/8.pdf')).toBeNull()
      await expect(files.get('invoices/../7.pdf')).rejects.toThrow(RangeError)
      expect(await files.put('../outside.pdf', PDF)).toEqual({
        ok: false,
        error: { code: 'unavailable' },
      })
    }
  })

  it('is the bucket where it is set, a folder off Vercel, and none on Vercel without it', () => {
    expect(invoiceFilesFor({ ...NO_BUCKET, VERCEL_ENV: undefined }, folder)).not.toBeNull()
    expect(invoiceFilesFor({ ...NO_BUCKET, VERCEL_ENV: 'production' }, folder)).toBeNull()
    expect(invoiceFilesFor({ ...NO_BUCKET, VERCEL_ENV: 'preview' }, folder)).toBeNull()
    const withBucket = invoiceFilesFor(
      {
        R2_ACCOUNT_ID: 'fake-account',
        R2_ACCESS_KEY_ID: 'fake-key-id',
        R2_SECRET_ACCESS_KEY: 'fake-secret',
        R2_BUCKET_PRIVATE: 'fake-private',
        VERCEL_ENV: 'production',
      },
      folder,
    )
    expect(withBucket).not.toBeNull()
  })
})

type Staff = Record<string, unknown> | null

function request(user: Staff, invoice: Record<string, unknown> | null) {
  const findByID = vi.fn(async () => invoice)
  const create = vi.fn(async () => ({}))
  const req = { user, payload: { findByID, create }, headers: new Headers() }
  return { req: req as never, findByID, create }
}

const staff = (roles: string[], over: Record<string, unknown> = {}): Staff => ({
  id: 3,
  email: 'finance.test@example.invalid',
  collection: 'users',
  roles,
  active: true,
  _strategy: 'totp',
  ...over,
})

describe('downloading an invoice PDF', () => {
  const stored = async () => {
    const files = memoryInvoiceFiles()
    await files.put('invoices/42.pdf', PDF)
    return files
  }

  it('refuses before reading anything: no session, no code, another role, a deactivated account', async () => {
    const files = await stored()
    for (const [user, status] of [
      [null, 401],
      [{ id: 1, collection: 'people', roles: ['owner'] }, 401],
      [staff(['finance'], { _strategy: 'local-jwt' }), 403],
      [staff(['operator']), 403],
      [staff(['practitioner']), 403],
      [staff(['editor']), 403],
      [staff(['owner'], { active: false }), 403],
    ] as const) {
      const { req, findByID, create } = request(user, { id: 42, pdfKey: 'invoices/42.pdf' })
      const answer = await downloadInvoicePdf(req, '42', files)
      expect(answer.ok, JSON.stringify(user)).toBe(false)
      if (!answer.ok) expect(statusOf(answer.error)).toBe(status)
      expect(findByID).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    }
  })

  it('gives finance and owners the PDF, read with their own access, after the audit entry', async () => {
    for (const roles of [['finance'], ['owner']]) {
      const { req, findByID, create } = request(staff(roles), {
        id: 42,
        number: 'INV/2099/0001',
        pdfKey: 'invoices/42.pdf',
      })
      const answer = await downloadInvoicePdf(req, '42', await stored())
      expect(answer).toEqual({ ok: true, value: { pdf: PDF, filename: 'INV-2099-0001.pdf' } })
      expect(findByID).toHaveBeenCalledWith(
        expect.objectContaining({ collection: 'invoices', id: 42, overrideAccess: false }),
      )
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: 'audit-log',
          data: expect.objectContaining({
            action: 'download-invoice',
            entity: 'invoices',
            entityId: '42',
          }),
        }),
      )
    }
  })

  it('answers an id that is not one, a missing invoice, one without a PDF, and no store', async () => {
    const files = await stored()
    const cases: [string, Record<string, unknown> | null, typeof files | null, string][] = [
      ['abc', { id: 42, pdfKey: 'invoices/42.pdf' }, files, 'invalid'],
      ['-1', { id: 42, pdfKey: 'invoices/42.pdf' }, files, 'invalid'],
      ['42', null, files, 'not-found'],
      ['42', { id: 42, pdfKey: null }, files, 'no-pdf'],
      ['42', { id: 42, pdfKey: '../../etc/passwd' }, files, 'no-pdf'],
      ['43', { id: 43, pdfKey: 'invoices/43.pdf' }, files, 'no-pdf'],
      ['42', { id: 42, pdfKey: 'invoices/42.pdf' }, null, 'storage-missing'],
    ]
    for (const [id, invoice, store, code] of cases) {
      const { req, create } = request(staff(['finance']), invoice)
      const answer = await downloadInvoicePdf(req, id, store)
      expect(answer, `${id} ${code}`).toEqual({ ok: false, error: { code } })
      expect(create).not.toHaveBeenCalled()
      if (!answer.ok)
        expect(messageOf(answer.error)).toBe(INVOICE_DOWNLOAD_ANSWERS[code as 'invalid'])
    }
  })

  it('names the file by Zoho’s number in safe characters, or by its id', () => {
    expect(invoiceFilename('INV/2099/0001', 42)).toBe('INV-2099-0001.pdf')
    expect(invoiceFilename('"; rm -rf', 42)).toBe('rm-rf.pdf')
    expect(invoiceFilename(null, 42)).toBe('invoice-42.pdf')
    expect(invoiceFilename('///', 42)).toBe('invoice-42.pdf')
  })
})
