import { S3Client } from '@aws-sdk/client-s3'

import type { ServerEnv } from '@/lib/env'

/**
 * Cloudflare R2's private bucket (docs/07), through its S3 API: certificates' PDFs
 * (`certificates/…`, src/lib/certificates/store.ts) and access requests' exports
 * (`privacy-exports/…`, src/lib/privacy/store.ts). Nothing in it is public; each file is read only
 * through a route that checks the user and role first and writes its own audit entry.
 */

export type PrivateBucketEnv = Pick<
  ServerEnv,
  'R2_ACCOUNT_ID' | 'R2_ACCESS_KEY_ID' | 'R2_SECRET_ACCESS_KEY' | 'R2_BUCKET_PRIVATE'
>

export type PrivateBucket = { client: S3Client; bucket: string }

/** The private bucket and its client when R2 and the bucket are configured, or null. */
export function privateBucketOf(env: PrivateBucketEnv): PrivateBucket | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_PRIVATE } = env
  if (!R2_BUCKET_PRIVATE || !R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    return null
  }
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  })
  return { client, bucket: R2_BUCKET_PRIVATE }
}
