import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { GetObjectCommand, NoSuchKey, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3'

import type { ServerEnv } from '@/lib/env'
import { err, ok, type Result } from '@/lib/result'
import { privateBucketOf } from '@/lib/storage/privateBucket'

import type { CertificateStore } from './contract'
import { parseCertificateId } from './ids'

/**
 * Where a certificate's PDF is kept (docs/18 §4; docs/07, the private bucket): Cloudflare R2's
 * private bucket on a deployment, read only through the checked download route; a folder outside
 * `public/` in development and CI; memory in tests. The key is `certificates/<year>/<ID>.pdf` and
 * nothing else is accepted, so no key can reach outside its folder.
 */

const PDF_KEY = /^certificates\/(\d{4})\/(IIIC-C-\d{4}-\d{4,6}-\d)\.pdf$/

/** The PDF's key in the store, from its printed ID. */
export function pdfKeyFor(certificateId: string): string {
  const parsed = parseCertificateId(certificateId)
  if (!parsed) throw new RangeError('not a certificate ID')
  return `certificates/${parsed.year}/${certificateId}.pdf`
}

/** Whether a key is one `pdfKeyFor` makes, its year matching its ID's. */
export function isPdfKey(key: string): boolean {
  const match = PDF_KEY.exec(key)
  if (!match) return false
  const parsed = parseCertificateId(match[2] as string)
  return parsed !== null && String(parsed.year) === match[1]
}

function checked(key: string): string {
  if (!isPdfKey(key)) throw new RangeError('not a certificate PDF key')
  return key
}

/** In memory: tests' store. */
export function memoryStore(): CertificateStore & { keys(): string[] } {
  const files = new Map<string, Uint8Array>()
  return {
    async put(key, pdf) {
      files.set(checked(key), new Uint8Array(pdf))
    },
    async get(key) {
      const file = files.get(checked(key))
      return file ? new Uint8Array(file) : null
    },
    keys: () => [...files.keys()],
  }
}

/** A folder on this machine: development and CI. Never under `public/`. */
export function folderStore(root: string): CertificateStore {
  const resolve = (key: string) => path.join(root, ...checked(key).split('/'))
  return {
    async put(key, pdf) {
      const file = resolve(key)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, pdf)
    },
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
export function bucketStore(client: S3Client, bucket: string): CertificateStore {
  return {
    async put(key, pdf) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: checked(key),
          Body: pdf,
          ContentType: 'application/pdf',
        }),
      )
    },
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
export const LOCAL_FOLDER = path.join(process.cwd(), 'private-files')

type StoreEnv = Pick<
  ServerEnv,
  'R2_ACCOUNT_ID' | 'R2_ACCESS_KEY_ID' | 'R2_SECRET_ACCESS_KEY' | 'R2_BUCKET_PRIVATE' | 'VERCEL_ENV'
>

/**
 * The store this deployment uses: the private bucket when R2 and the bucket are configured; the
 * local folder off Vercel; on a Vercel deployment without them, none (`storage-missing`), so no
 * certificate is issued whose PDF could not be kept.
 */
export function certificateStoreFor(
  env: StoreEnv,
  folder: string = LOCAL_FOLDER,
): Result<CertificateStore, { code: 'storage-missing' }> {
  const bucket = privateBucketOf(env)
  if (bucket) return ok(bucketStore(bucket.client, bucket.bucket))
  if (env.VERCEL_ENV === 'preview' || env.VERCEL_ENV === 'production') {
    return err({ code: 'storage-missing' })
  }
  return ok(folderStore(folder))
}
