// @vitest-environment node
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { formatCertificateId } from '@/lib/certificates/ids'
import {
  certificateStoreFor,
  folderStore,
  isPdfKey,
  memoryStore,
  pdfKeyFor,
} from '@/lib/certificates/store'

// Where the PDFs are kept (docs/18 §4): the private bucket on a deployment, refused there without
// it; a folder in development and CI; and only keys of the one shape, so nothing reaches outside.

const id = formatCertificateId(2099, 1)
const pdf = new TextEncoder().encode('%PDF-1.7 fake')
const folders: string[] = []

afterAll(async () => {
  for (const folder of folders) await rm(folder, { recursive: true, force: true })
})

describe('the certificate store', () => {
  it('keys a PDF by its year and ID', () => {
    expect(pdfKeyFor(id)).toBe(`certificates/2099/${id}.pdf`)
    expect(isPdfKey(pdfKeyFor(id))).toBe(true)
    expect(() => pdfKeyFor('IIIC-C-2099-0001-0')).toThrow(RangeError)
  })

  it('accepts no other key, so a path cannot climb out of its folder', async () => {
    const store = memoryStore()
    for (const key of [
      '../etc/passwd',
      `certificates/2098/${id}.pdf`,
      `certificates/2099/../${id}.pdf`,
      `certificates/2099/${id}.pdf/x`,
    ]) {
      expect(isPdfKey(key)).toBe(false)
      await expect(store.put(key, pdf)).rejects.toThrow(RangeError)
    }
  })

  it('keeps and returns a PDF in memory, and answers null for one it lacks', async () => {
    const store = memoryStore()
    await store.put(pdfKeyFor(id), pdf)
    expect(await store.get(pdfKeyFor(id))).toEqual(pdf)
    expect(await store.get(pdfKeyFor(formatCertificateId(2099, 2)))).toBeNull()
  })

  it('keeps a PDF in a folder under its key', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'iiic-certificates-'))
    folders.push(root)
    const store = folderStore(root)
    await store.put(pdfKeyFor(id), pdf)
    expect(await store.get(pdfKeyFor(id))).toEqual(pdf)
    expect(await readdir(path.join(root, 'certificates', '2099'))).toEqual([`${id}.pdf`])
    expect(await store.get(pdfKeyFor(formatCertificateId(2099, 3)))).toBeNull()
  })

  it('refuses on a Vercel deployment without the private bucket, and uses the folder off Vercel', () => {
    for (const VERCEL_ENV of ['preview', 'production'] as const) {
      const store = certificateStoreFor({ VERCEL_ENV, R2_BUCKET_PRIVATE: 'iiic-private' })
      expect(store).toEqual({ ok: false, error: { code: 'storage-missing' } })
    }
    expect(certificateStoreFor({}).ok).toBe(true)
    expect(certificateStoreFor({ VERCEL_ENV: 'development' }).ok).toBe(true)
  })

  it('uses the bucket once R2 and the bucket are configured', () => {
    const store = certificateStoreFor({
      VERCEL_ENV: 'production',
      R2_ACCOUNT_ID: 'example-account',
      R2_ACCESS_KEY_ID: 'example-key-id',
      R2_SECRET_ACCESS_KEY: 'example-secret',
      R2_BUCKET_PRIVATE: 'iiic-private',
    })
    expect(store.ok).toBe(true)
  })
})
