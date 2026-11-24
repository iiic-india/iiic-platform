import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { GetObjectCommand, NoSuchKey, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3'

import type { ServerEnv } from '@/lib/env'
import { err, ok } from '@/lib/result'
import { privateBucketOf } from '@/lib/storage/privateBucket'

import type { DocumentStore } from './deps'
import { isInvoicePdfKey } from './keys'

export { invoicePdfKey, isInvoicePdfKey } from './keys'

/**
 * Where a client's invoice and credit-note PDFs are kept (docs/07, the private bucket; D-88; M7):
 * Cloudflare R2's private bucket, as the certificates' PDFs are (src/lib/certificates/store.ts),
 * read only through the checked and audited download route; a folder outside `public/` in
 * development and CI; memory in tests. On a Vercel deployment without the bucket there is no
 * store, and Zoho Books' own copy stands (src/lib/invoicing/issue.ts). The key is
 * `invoices/<the mirror's id>.pdf` and nothing else is accepted, so no key reaches outside it.
 */

function checked(key: string): string {
  if (!isInvoicePdfKey(key)) throw new RangeError('not an invoice PDF key')
  return key
}

/** The store the documents module writes to, and the download route reads from. */
export interface InvoiceFiles extends DocumentStore {
  get(key: string): Promise<Uint8Array | null>
}

/** A write that failed is `unavailable`: the document stays issued and its PDF is made again. */
const writing = async (write: () => Promise<unknown>) => {
  try {
    await write()
    return ok(undefined)
  } catch {
    return err({ code: 'unavailable' as const })
  }
}

/** In memory: tests' store. */
export function memoryInvoiceFiles(): InvoiceFiles & { keys(): string[] } {
  const files = new Map<string, Uint8Array>()
  return {
    put: (key, bytes) => writing(async () => files.set(checked(key), new Uint8Array(bytes))),
    async get(key) {
      const file = files.get(checked(key))
      return file ? new Uint8Array(file) : null
    },
    keys: () => [...files.keys()],
  }
}

/** A folder on this machine: development and CI. Never under `public/`. */
export function folderInvoiceFiles(root: string): InvoiceFiles {
  const resolve = (key: string) => path.join(root, ...checked(key).split('/'))
  return {
    put: (key, bytes) =>
      writing(async () => {
        const file = resolve(key)
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(file, bytes)
      }),
    async get(key) {
      try {
        return new Uint8Array(await readFile(resolve(key)))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
    },
  }
}

/** The private bucket, through R2's S3 API. */
export function bucketInvoiceFiles(client: S3Client, bucket: string): InvoiceFiles {
  return {
    put: (key, bytes) =>
      writing(() =>
        client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: checked(key),
            Body: bytes,
            ContentType: 'application/pdf',
          }),
        ),
      ),
    async get(key) {
      try {
        const object = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: checked(key) }),
        )
        return object.Body ? await object.Body.transformToByteArray() : null
      } catch (error) {
        if (error instanceof NoSuchKey) return null
        throw error
      }
    },
  }
}

/** The local folder, beside the app and outside `public/` (ignored by git). */
const LOCAL_FOLDER = path.join(process.cwd(), 'private-files')

type StoreEnv = Pick<
  ServerEnv,
  'R2_ACCOUNT_ID' | 'R2_ACCESS_KEY_ID' | 'R2_SECRET_ACCESS_KEY' | 'R2_BUCKET_PRIVATE' | 'VERCEL_ENV'
>

/** The store this deployment uses, or null on a Vercel deployment without the private bucket. */
export function invoiceFilesFor(env: StoreEnv, folder: string = LOCAL_FOLDER): InvoiceFiles | null {
  const bucket = privateBucketOf(env)
  if (bucket) return bucketInvoiceFiles(bucket.client, bucket.bucket)
  if (env.VERCEL_ENV) return null
  return folderInvoiceFiles(folder)
}
