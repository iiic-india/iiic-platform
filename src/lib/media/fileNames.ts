import { createHash } from 'node:crypto'

import type { CollectionBeforeOperationHook } from 'payload'

/**
 * Media files are named by their content (docs/12 §4): the name an editor's file had, then the
 * first twelve hex characters of the SHA-256 of its bytes, then its extension. A changed image
 * is a new address, so the bucket's files and next/image's copies can be kept for a month
 * without anyone seeing an old picture (src/lib/media/nextImages.ts). Payload then makes the
 * name safe and unique and gives it the extension of the format it stores.
 */
export function nameByContent(name: string, data: Uint8Array): string {
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 12)
  const dot = name.lastIndexOf('.')
  const [base, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
  return `${base}-${hash}${extension}`
}

/** Renames the file a create or an update brings, before Payload stores it. */
export const nameUploadByContent: CollectionBeforeOperationHook = ({ args, operation, req }) => {
  if (operation !== 'create' && operation !== 'update') return args
  const file = req.file
  if (file?.data && file.data.length > 0) file.name = nameByContent(file.name, file.data)
  return args
}
