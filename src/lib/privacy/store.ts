import 'server-only'

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { GetObjectCommand, NoSuchKey, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3'

import { env, type ServerEnv } from '@/lib/env'
import { privateBucketOf } from '@/lib/storage/privateBucket'

/**
 * Where an access request's export is kept until an owner sends it (docs/18 §5): never in
 * `public/`, never served without the checked download route. Locally and in CI a folder at the
 * project's root, `.private-store/` (git ignores it); on a deployment the private R2 bucket
 * (R2_BUCKET_PRIVATE) under `privacy-exports/`, beside the certificates' PDFs. A Vercel deployment
 * without the bucket has no store, and the export is refused as `storage-missing`.
 */
export type PrivateStore = {
  put: (key: string, body: string, contentType: string) => Promise<void>
  get: (key: string) => Promise<Buffer | null>
}

/** A key the store accepts: lower-case segments, no way out of its folder. */
const SAFE_KEY = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*\/[a-z0-9-]+\.(?:json|html)$/

export const isSafeKey = (key: string): boolean => SAFE_KEY.test(key) && !key.includes('..')

function checked(key: string): string {
  if (!isSafeKey(key)) throw new Error('The private store refused a key outside its folder.')
  return key
}

/** The folder implementation: local development, CI and the integration tests. */
export function folderStore(root: string): PrivateStore {
  const where = (key: string) => path.join(root, ...checked(key).split('/'))
  return {
    async put(key, body) {
      const file = where(key)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, body, 'utf8')
    },
    async get(key) {
      try {
        return await readFile(where(key))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
    },
  }
}

/** The private bucket, through R2's S3 API. */
export function bucketStore(client: S3Client, bucket: string): PrivateStore {
  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: checked(key),
          Body: body,
          ContentType: contentType,
        }),
      )
    },
    async get(key) {
      try {
        const object = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: checked(key) }),
        )
        return object.Body ? Buffer.from(await object.Body.transformToByteArray()) : null
      } catch (error) {
        if (error instanceof NoSuchKey) return null
        throw error
      }
    },
  }
}

type StoreEnv = Pick<
  ServerEnv,
  'R2_ACCOUNT_ID' | 'R2_ACCESS_KEY_ID' | 'R2_SECRET_ACCESS_KEY' | 'R2_BUCKET_PRIVATE' | 'VERCEL_ENV'
>

/**
 * The store for an environment: the private bucket when R2 and the bucket are configured; none on
 * a Vercel deployment without them; the local folder anywhere else.
 */
export function privateStoreFor(
  config: StoreEnv,
  folder: string = path.resolve(process.cwd(), '.private-store'),
): PrivateStore | null {
  const bucket = privateBucketOf(config)
  if (bucket) return bucketStore(bucket.client, bucket.bucket)
  if (config.VERCEL_ENV) return null
  return folderStore(folder)
}

/** This deployment's store, or null where none is configured. */
export function privateStore(): PrivateStore | null {
  return privateStoreFor(env())
}
