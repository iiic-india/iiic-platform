import type { Payload, PayloadRequest } from 'payload'

import { pagePath } from '@/lib/content/slug'

import { MAX_REDIRECTS, type RedirectStatus, withoutSection } from './paths'

/**
 * The redirects as the site follows them: each from an address to an address, now. A redirect
 * that leads to a page by reference (the redirects plugin's "A page") leads wherever the page
 * lives: the address of its row, which only publishing or unpublishing changes, so a draft at a
 * new address is not followed before it is published.
 */

export type RedirectId = number | string

/** Where a stored redirect leads, as the plugin keeps it (its `to` group). */
export type StoredTarget =
  | {
      type?: 'reference' | 'custom' | null
      reference?: {
        relationTo: string
        value: RedirectId | { id: RedirectId }
      } | null
      url?: string | null
    }
  | null
  | undefined

/** A redirect resolved to addresses. */
export type Rule = {
  id?: RedirectId
  from: string
  /** The address it leads to now, with the section it opens if it names one. */
  to: string
  status?: RedirectStatus
  /** The page it leads to, when it leads to one by reference. */
  pageId?: RedirectId
}

export const sameId = (a: RedirectId | undefined, b: RedirectId | undefined) =>
  a !== undefined && b !== undefined && String(a) === String(b)

/** The page a redirect leads to by reference, if it does. The plugin's default kind is a page. */
export function referencedPage(to: StoredTarget): RedirectId | undefined {
  if (!to || to.type === 'custom') return undefined
  const value = to.reference?.value
  if (value === undefined || value === null) return undefined
  return typeof value === 'object' ? value.id : value
}

/**
 * Where a stored redirect leads, given the address of each page it may name: null when it leads
 * nowhere (its page was deleted, or no address was given).
 */
export function resolveTarget(to: StoredTarget, slugs: ReadonlyMap<string, string>): string | null {
  if (to?.type === 'custom') return typeof to.url === 'string' && to.url !== '' ? to.url : null
  const page = referencedPage(to)
  const slug = page === undefined ? undefined : slugs.get(String(page))
  return slug ? pagePath(slug) : null
}

/** The slug of each page, by id, from the pages' own rows (their live address). */
export async function slugsOf(
  payload: Payload,
  ids: readonly RedirectId[],
  req?: PayloadRequest,
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.map(String))]
  if (unique.length === 0) return new Map()
  const { docs } = await payload.find({
    collection: 'pages',
    where: { id: { in: unique } },
    limit: unique.length,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { slug: true },
    req,
  })
  return new Map(docs.map((page) => [String(page.id), page.slug]))
}

/** Where one stored redirect leads now, read past the access rules (a check before a save). */
export async function targetOf(
  to: StoredTarget,
  payload: Payload,
  req?: PayloadRequest,
): Promise<string | null> {
  const page = referencedPage(to)
  return resolveTarget(to, await slugsOf(payload, page === undefined ? [] : [page], req))
}

/**
 * Every redirect, resolved, read past the access rules: by the site to answer an address, by
 * the checks before a save and by a page's move. Within a request it reads that request's
 * transaction, so a check sees the writes made before it. A redirect that leads nowhere is left
 * out: it sends no one anywhere.
 */
export async function readRedirects(payload: Payload, req?: PayloadRequest): Promise<Rule[]> {
  const { docs } = await payload.find({
    collection: 'redirects',
    limit: MAX_REDIRECTS,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { from: true, to: true, type: true },
    req,
  })
  const slugs = await slugsOf(
    payload,
    docs.flatMap((doc) => referencedPage(doc.to) ?? []),
    req,
  )
  return docs.flatMap((doc): Rule[] => {
    const to = resolveTarget(doc.to, slugs)
    if (to === null) return []
    const pageId = referencedPage(doc.to)
    return [
      {
        id: doc.id,
        from: doc.from,
        to,
        status: doc.type,
        ...(pageId === undefined ? {} : { pageId }),
      },
    ]
  })
}

/** At most this many redirects are followed for one address; past it, it is a loop or worse. */
export const MAX_HOPS = 5

/**
 * Where an address leads in the end, following any redirect from where a redirect leads, so a
 * visitor is sent in one step even if redirects ever chain; null when the address has no
 * redirect, or when following them comes back to an address already passed (a loop), which
 * would send the browser round for ever. The admin refuses chains and loops; this holds the
 * line if one ever arises another way.
 */
export function finalTarget(
  path: string,
  table: ReadonlyMap<string, Pick<Rule, 'to' | 'status'>>,
): Pick<Rule, 'to' | 'status'> | null {
  const first = table.get(path)
  if (!first) return null
  const passed = new Set([path])
  let to = first.to
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const address = withoutSection(to)
    if (passed.has(address)) return null
    const next = table.get(address)
    if (!next) return { to, status: first.status }
    passed.add(address)
    to = next.to
  }
  return null
}
