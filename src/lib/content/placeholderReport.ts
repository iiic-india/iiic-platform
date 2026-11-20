import type { Payload, PayloadRequest } from 'payload'

import { STARTER_PAGES } from '@/content/starter'

import { buildReport, type Report, type ReportSource } from './placeholders'
import { pagePath } from './slug'

/**
 * The placeholders report over everything a visitor can be shown (D-56): the pages in the
 * admin, as their latest drafts, and the starter pages that have not been brought in yet
 * (D-51). Read with the staff member's own access, never past it: only the roles that read
 * drafts get any page at all.
 */
export async function loadPlaceholderReport(
  payload: Payload,
  user: PayloadRequest['user'],
  adminRoute: string,
): Promise<Report> {
  const { docs } = await payload.find({
    collection: 'pages',
    draft: true,
    pagination: false,
    depth: 0,
    select: { title: true, slug: true, layout: true, legalReview: true },
    overrideAccess: false,
    user,
  })
  const inAdmin: ReportSource[] = docs.map((doc) => ({
    page: {
      title: doc.title,
      path: pagePath(doc.slug),
      href: `${adminRoute}/collections/pages/${doc.id}`,
      inAdmin: true,
    },
    content: doc,
  }))
  const taken = new Set(docs.map((doc) => doc.slug))
  const starters: ReportSource[] = Object.values(STARTER_PAGES)
    .filter((page) => !taken.has(page.slug))
    .map((page) => ({
      page: {
        title: page.title,
        path: pagePath(page.slug),
        href: pagePath(page.slug),
        inAdmin: false,
      },
      content: page,
    }))
  return buildReport([...inAdmin, ...starters])
}
