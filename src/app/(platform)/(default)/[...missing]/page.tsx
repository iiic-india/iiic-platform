import { notFound } from 'next/navigation'

/**
 * Every path no page claims lands here, so it gets the site's own 404 inside the shell
 * (not-found.tsx beside this folder) instead of Next's built-in page.
 */
export default function MissingPage(): never {
  notFound()
}
