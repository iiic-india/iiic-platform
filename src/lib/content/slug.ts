/** A page's address without its first slash: "framework", "organisations/team-map". */
export const PAGE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/

/** Where a page lives: "home" is the first page, and every other slug is its own path. */
export function pagePath(slug: string): string {
  return slug === 'home' ? '/' : `/${slug}`
}
