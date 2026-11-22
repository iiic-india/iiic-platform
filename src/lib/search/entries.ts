import { PAGE_SLUG, pagePath } from '@/lib/content/slug'
import { articlePath, isArticleSlug, JOURNAL_PATH } from '@/lib/journal/addresses'
import { bodyText } from '@/lib/journal/readingTime'
import { APP_PAGES } from '@/lib/seo/appPages'
import { isNoindexPath } from '@/lib/seo/paths'
import { canonicalPath, fact } from '@/lib/seo/site'
import { CONSULTANCY_SERVICES, TEAM_MAP } from '@/lib/site/consultancy'

import type { SearchKind } from './kinds'
import { contentOf, visibleText } from './text'

/**
 * What the search index holds for a document (docs/04 `search_index`), and which documents it
 * holds at all. The index takes a document's words as a visitor reads them on the site: never a
 * draft, never a page on a route that is never indexed (D-67), never a service that is not
 * offered, and nothing a visitor cannot read: a service's prices, its SAC code and its booking
 * rules stay out, and no person's data is in any of these collections. Pure functions over the
 * documents, so the plugin's hooks (src/plugins/searchIndex.ts), the starter pages' entries and
 * the tests apply the same rules.
 */

/** What an entry of the index carries besides its document and priority. */
export type IndexedFields = {
  title: string
  /** The path on this site a result opens. */
  url: string
  /** A line a result may show when no sentence of the text matched. */
  excerpt: string | null
  /** The text the query is matched against, one line per part, without placeholders. */
  content: string
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' ? fact(value) : undefined

/** The pages the app draws itself (/map, /journal): a page published at their address is never shown. */
const APP_PATHS = new Set<string>(APP_PAGES.map(({ path }) => path))

/**
 * Whether a page at a path is one a visitor can reach and a search engine may list: not a route
 * that is never indexed (D-67), not under /og/ (the share images' route) or the Journal (whose
 * own routes answer there), and not a page the app draws itself. The sitemap leaves out the
 * same addresses (src/lib/seo/sitemap.ts).
 */
export function isSearchablePath(path: string): boolean {
  const clean = canonicalPath(path)
  if (isNoindexPath(clean) || APP_PATHS.has(clean)) return false
  if (clean.startsWith('/og/')) return false
  return clean !== JOURNAL_PATH && !clean.startsWith(`${JOURNAL_PATH}/`)
}

type PageLike = { title?: unknown; slug?: unknown; description?: unknown; layout?: unknown }

/** A page, from the CMS or a starter page: its title, its description and its sections' words. */
export function pageEntry(page: PageLike): IndexedFields | null {
  if (typeof page.slug !== 'string' || !PAGE_SLUG.test(page.slug)) return null
  const url = canonicalPath(pagePath(page.slug))
  const title = text(page.title)
  if (!title || !isSearchablePath(url)) return null
  const description = text(page.description) ?? null
  return {
    title,
    url,
    excerpt: description,
    content: contentOf([title, description, ...visibleText(page.layout)]),
  }
}

type PostLike = {
  title?: unknown
  slug?: unknown
  excerpt?: unknown
  description?: unknown
  body?: unknown
  question?: unknown
}

/** A Journal article: its title, excerpt, body and the question it ends with. */
export function postEntry(post: PostLike): IndexedFields | null {
  if (typeof post.slug !== 'string' || !isArticleSlug(post.slug)) return null
  const title = text(post.title)
  if (!title) return null
  const excerpt = text(post.excerpt) ?? null
  return {
    title,
    url: articlePath(post.slug),
    excerpt: text(post.description) ?? excerpt,
    content: contentOf([title, excerpt, bodyText(post.body), text(post.question)]),
  }
}

type FaqLike = { question?: unknown; answer?: unknown; page?: unknown }

/** A question and its answer, which open the page they are asked about. */
export function faqEntry(faq: FaqLike): IndexedFields | null {
  if (typeof faq.page !== 'string' || !PAGE_SLUG.test(faq.page)) return null
  const url = canonicalPath(pagePath(faq.page))
  const question = text(faq.question)
  if (!question || !isSearchablePath(url)) return null
  return { title: question, url, excerpt: null, content: contentOf([question, text(faq.answer)]) }
}

/** Each register's door, in the words the site's navigation gives it (src/components/site/SiteHeader.tsx). */
const DOORS = {
  consultancy: { path: '/organisations', name: 'For organisations' },
  counselling: { path: '/counselling', name: 'Counselling' },
  education: { path: '/learn', name: 'Learn' },
} as const

/** The services' formats, in the admin's words for them (src/collections/Services.ts). */
const FORMATS = {
  online: 'Online',
  office: 'At the office',
  both: 'Online or at the office',
} as const

type ServiceLike = {
  name?: unknown
  slug?: unknown
  register?: unknown
  format?: unknown
  active?: unknown
}

/**
 * Where a service's result leads: a consultancy service to its own page under /organisations
 * when the site has one at its address (src/lib/site/consultancy.ts), and every other service
 * to its door. A service has no page of its own (docs/02).
 */
function serviceUrl(slug: string, register: keyof typeof DOORS): string {
  if (register === 'consultancy') {
    const own = [...CONSULTANCY_SERVICES, TEAM_MAP].find(
      (offer) => offer.slug === `organisations/${slug}`,
    )
    if (own) return pagePath(own.slug)
  }
  return DOORS[register].path
}

/**
 * A service offered now: its name, and a line with its door and its format. Never its options'
 * prices, its GST, its SAC code or its booking rules (D-21): the index holds only what a
 * visitor's read of the service returns.
 */
export function serviceEntry(service: ServiceLike): IndexedFields | null {
  if (service.active !== true || typeof service.slug !== 'string') return null
  const register = service.register
  if (typeof register !== 'string' || !Object.hasOwn(DOORS, register)) return null
  const door = DOORS[register as keyof typeof DOORS]
  const title = text(service.name)
  if (!title) return null
  const format =
    typeof service.format === 'string' && Object.hasOwn(FORMATS, service.format)
      ? FORMATS[service.format as keyof typeof FORMATS]
      : null
  const excerpt = format ? `${door.name} · ${format}` : door.name
  return {
    title,
    url: serviceUrl(service.slug, register as keyof typeof DOORS),
    excerpt,
    content: contentOf([title, excerpt]),
  }
}

/** What the index holds for a document of a kind, or null when it holds nothing for it. */
export function indexedFields(
  kind: SearchKind,
  doc: Record<string, unknown>,
): IndexedFields | null {
  switch (kind) {
    case 'pages':
      return pageEntry(doc)
    case 'posts':
      return postEntry(doc)
    case 'faqs':
      return faqEntry(doc)
    case 'services':
      return serviceEntry(doc)
  }
}

/**
 * Whether a saved document must have no entry in the index: one that is published, or that has
 * no drafts, and that the index holds nothing for. A draft is left to the plugin, which keeps the
 * entry of a published document while a new draft of it is written and removes it when the
 * document is unpublished (`deleteDrafts`).
 */
export function staysOutOfIndex(kind: SearchKind, doc: Record<string, unknown>): boolean {
  if (doc._status === 'draft') return false
  return indexedFields(kind, doc) === null
}
