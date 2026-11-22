/**
 * What next/image may load and how long it keeps what it made (docs/12 §2, §4), for
 * next.config.ts, which reads this at build time, so it imports nothing:
 * - Payload's own file route, where the media library is served while R2 is not configured
 *   (development, CI);
 * - the public media bucket's address (R2_PUBLIC_BASE_URL, D-46), and nothing else: the private
 *   documents bucket is never an image source;
 * - a month in the optimiser's cache: a file's name carries a hash of its content
 *   (src/collections/Media.ts), so a changed image is a new address.
 */

/** A month, in seconds. */
export const IMAGE_CACHE_SECONDS = 60 * 60 * 24 * 31

type RemotePattern = { protocol: 'https'; hostname: string; port: ''; pathname: string }

/** The public bucket's address as a pattern, or none while it is unset or not https. */
export function mediaRemotePatterns(baseUrl: string | undefined): RemotePattern[] {
  if (!baseUrl) return []
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    return []
  }
  if (url.protocol !== 'https:') return []
  const base = url.pathname.replace(/\/+$/, '')
  return [{ protocol: 'https', hostname: url.hostname, port: '', pathname: `${base}/**` }]
}

/** next.config.ts's `images`. */
export function imagesConfig(baseUrl: string | undefined) {
  return {
    localPatterns: [{ pathname: '/api/media/file/**' }],
    remotePatterns: mediaRemotePatterns(baseUrl),
    minimumCacheTTL: IMAGE_CACHE_SECONDS,
  }
}
