/**
 * The preview's two routes (docs/15 §5.3, OS-4), with nothing else, so that the browser's code
 * can link to them without loading the access rules.
 */

/** Turns on preview for staff who may, and opens the document at its address. */
export const PREVIEW_ROUTE = '/api/preview'

/** Turns preview off again. */
export const EXIT_PREVIEW_ROUTE = '/api/preview/exit'

/** The link that leaves preview and returns to an address on the site. */
export function exitPreviewUrl(path: string): string {
  return `${EXIT_PREVIEW_ROUTE}?${new URLSearchParams({ path }).toString()}`
}
