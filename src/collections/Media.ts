import type { CollectionConfig } from 'payload'

import { allow, POLICY } from '@/access/policy'
import { nameUploadByContent } from '@/lib/media/fileNames'

/**
 * Images for public pages. Alt text is required (docs/12 §9). Files are re-encoded by
 * sharp on upload, which strips metadata, and stored in the R2 public bucket once R2 is
 * configured (src/payload.config.ts); up to 4 MB each (D-46). Each file is named by its
 * content (src/lib/media/fileNames.ts), so its address changes when the image does and it can
 * be cached for a month (docs/12 §4). Journal articles draw these images in their bodies.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  admin: { group: 'Content' },
  // src/access/policy.ts (docs/05): anyone reads published media; owners, operators and
  // editors add and edit it; owners and editors delete it.
  access: {
    read: allow(POLICY.media.read),
    create: allow(POLICY.media.create),
    update: allow(POLICY.media.update),
    delete: allow(POLICY.media.delete),
  },
  // Visitors read published media without signing in, so the staff two-factor wrapper
  // (payload-totp) stays off this one operation; every write still needs a verified code.
  custom: { totp: { disableAccessWrapper: { read: true } } },
  hooks: { beforeOperation: [nameUploadByContent] },
  upload: {
    mimeTypes: ['image/avif', 'image/webp', 'image/jpeg', 'image/png'],
    formatOptions: { format: 'webp', options: { quality: 82 } },
    resizeOptions: { width: 2400, withoutEnlargement: true },
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      admin: { description: 'What the image shows, for people who cannot see it. Required.' },
    },
  ],
}
