import type { CollectionConfig } from 'payload'

import { hasRole } from '@/access/roles'

/**
 * Images for public pages. Alt text is required (docs/12 §9). Files are re-encoded by
 * sharp on upload, which strips metadata. Storage moves to the R2 public bucket in a
 * later M1 slice; until then files stay on the local disk in development.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  admin: { group: 'Content' },
  access: {
    read: () => true,
    create: ({ req: { user } }) => hasRole(user, 'owner', 'editor', 'operator'),
    update: ({ req: { user } }) => hasRole(user, 'owner', 'editor', 'operator'),
    delete: ({ req: { user } }) => hasRole(user, 'owner', 'editor'),
  },
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
