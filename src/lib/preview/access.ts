import { z } from 'zod'

import { POLICY } from '@/access/policy'
import { hasRole, type MaybeStaff } from '@/access/roles'
import { PAGE_SLUG, pagePath } from '@/lib/content/slug'
import { articlePath, isArticleSlug } from '@/lib/journal/addresses'

import { PREVIEW_ROUTE } from './routes'

/**
 * Who may see a draft as the site draws it, and where (docs/15 §5.3, OS-4). Pure: the preview
 * route, the pages and the collections' preview links all ask here.
 * - Pages and Journal articles have previews; nothing else is drafted on the site.
 * - Only the staff who may read a collection's drafts (src/access/policy.ts), in a session that
 *   has entered its two-factor code (payload-totp's strategy), as for every draft read.
 */

/** The collections with a preview, each with the staff who read its drafts. */
export const PREVIEWS = {
  pages: POLICY.pages.read.roles,
  posts: POLICY.posts.read.roles,
} as const

export type PreviewCollection = keyof typeof PREVIEWS

/** Whether a session may see the drafts of a collection: its staff, after the two-factor code. */
export function canPreview(user: unknown, collection: PreviewCollection): boolean {
  const strategy = (user as { _strategy?: unknown } | null | undefined)?._strategy
  return strategy === 'totp' && hasRole(user as MaybeStaff, ...PREVIEWS[collection])
}

/** Whether a session may see a draft of anything the site draws. */
export function canPreviewAny(user: unknown): boolean {
  return (Object.keys(PREVIEWS) as PreviewCollection[]).some((collection) =>
    canPreview(user, collection),
  )
}

/** What a preview link asks for: a collection with a preview, and an address it could have. */
export const previewRequest = z
  .object({
    collection: z.enum(['pages', 'posts']),
    slug: z.string().max(200),
  })
  .refine(({ collection, slug }) => addressable(collection, slug), {
    message: 'No page can have this address',
    path: ['slug'],
  })

export type PreviewRequest = z.infer<typeof previewRequest>

function addressable(collection: PreviewCollection, slug: string): boolean {
  return collection === 'pages' ? PAGE_SLUG.test(slug) : isArticleSlug(slug)
}

/** Where a document is drawn on the site: a page at its path, an article under /journal. */
export function previewPath({ collection, slug }: PreviewRequest): string {
  return collection === 'pages' ? pagePath(slug) : articlePath(slug)
}

/**
 * The admin's preview link for a document, or null while it has no address yet (the admin then
 * shows no preview). Relative: the admin and the site share their origin.
 */
export function previewUrl(collection: PreviewCollection, slug: unknown): string | null {
  const parsed = previewRequest.safeParse({ collection, slug })
  if (!parsed.success) return null
  const query = new URLSearchParams({ collection, slug: parsed.data.slug })
  return `${PREVIEW_ROUTE}?${query.toString()}`
}

/** The widths the live preview offers beside "Responsive": those docs/11 §7 tests each device at. */
export const BREAKPOINTS = [
  { label: 'Phone', name: 'phone', width: 375, height: 812 },
  { label: 'Tablet', name: 'tablet', width: 768, height: 1024 },
  { label: 'Desktop', name: 'desktop', width: 1440, height: 900 },
]
