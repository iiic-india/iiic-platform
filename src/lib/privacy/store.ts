import 'server-only'

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { env } from '@/lib/env'

/**
 * Where an access request's export is kept until an owner sends it (docs/18 §5): never in
 * `public/`, never served without the checked download route. Locally and in CI a folder at the
 * project's root, `.private-store/` (git ignores it); on a Vercel deployment the private R2 bucket
 * (R2_BUCKET_PRIVATE), whose client builder B writes for certificates and the join wires here.
 * Until then a deployment has no store and the export is refused as `storage-missing`.
 */
export type PrivateStore = {
  put: (key: string, body: string, contentType: string) => Promise<void>
  get: (key: string) => Promise<Buffer | null>
}

/** A key the store accepts: lower-case segments, no way out of its folder. */
const SAFE_KEY = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*\/[a-z0-9-]+\.(?:json|html)$/

export const isSafeKey = (key: string): boolean => SAFE_KEY.test(key) && !key.includes('..')

/** The folder implementation: local development, CI and the integration tests. */
export function folderStore(root: string): PrivateStore {
  const where = (key: string) => {
    if (!isSafeKey(key)) throw new Error('The private store refused a key outside its folder.')
    return path.join(root, ...key.split('/'))
  }
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

/** This deployment's store, or null where none is configured yet. */
export function privateStore(): PrivateStore | null {
  if (env().VERCEL_ENV) return null
  return folderStore(path.resolve(process.cwd(), '.private-store'))
}
