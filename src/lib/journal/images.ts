/**
 * An image inside an article's body (docs/12 §2, §4, §9): what the page may draw from an upload
 * node of the article's editor (src/collections/Posts.ts). Only an image of the media library,
 * the public bucket's collection (D-46), with the alt text the library requires, its width and
 * height (so it moves nothing as it loads), and an address next/image may load: Payload's own
 * file route, or the public bucket's origin. Anything else draws nothing. Pure, so the page and
 * the tests read the same rule.
 */

/** Where an article's images are drawn: the narrow column, at most 760 px less its gutters. */
export const ARTICLE_IMAGE_SIZES = '(min-width: 760px) 712px, 100vw'

/** Payload's file route for the media library, which next.config.ts lets next/image load. */
const LOCAL_FILES = '/api/media/file/'

export type ArticleImage = { src: string; alt: string; width: number; height: number }

const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

/** The public bucket's origin, from its base URL, or undefined while R2 is not configured. */
export function mediaOriginOf(baseUrl: string | undefined): string | undefined {
  if (!baseUrl) return undefined
  try {
    const url = new URL(baseUrl)
    return url.protocol === 'https:' ? url.origin : undefined
  } catch {
    return undefined
  }
}

/** Whether next/image may load an address: Payload's file route, or the public bucket's. */
function servable(url: string, mediaOrigin: string | undefined): boolean {
  if (url.startsWith(LOCAL_FILES) && !url.includes('..')) return true
  if (!mediaOrigin) return false
  try {
    return new URL(url).origin === mediaOrigin
  } catch {
    return false
  }
}

/** The image an upload node draws, or null where it may draw none. */
export function articleImage(node: unknown, mediaOrigin: string | undefined): ArticleImage | null {
  const upload = node as { relationTo?: unknown; value?: unknown } | null
  if (!upload || upload.relationTo !== 'media') return null
  const doc = upload.value as Record<string, unknown> | null
  if (!doc || typeof doc !== 'object') return null
  const { url, alt, width, height, mimeType } = doc
  if (typeof url !== 'string' || !servable(url, mediaOrigin)) return null
  if (typeof alt !== 'string' || alt.trim() === '') return null
  if (typeof mimeType !== 'string' || !mimeType.startsWith('image/')) return null
  if (!positive(width) || !positive(height)) return null
  return { src: url, alt: alt.trim(), width, height }
}
