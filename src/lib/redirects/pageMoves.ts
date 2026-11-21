import { APIError, type CollectionAfterChangeHook, type CollectionBeforeChangeHook } from 'payload'

import { pagePath } from '@/lib/content/slug'

import { planPublish } from './chains'
import { readRedirects } from './table'

/**
 * A page published at a new address keeps its old one working (docs/12 §3, URLs; D-57): the old
 * address redirects to the page by reference, so it follows the page through any later move;
 * the redirects that named the old address name the new one; and a redirect from the page's
 * address goes, since the page lives there now. Nothing chains or loops
 * (src/lib/redirects/chains.ts); a publish that would is refused, and the page is not
 * published. The redirects change in the same transaction as the page, so either both happen
 * or neither does.
 *
 * Payload hands the hooks a page's latest version, which may be a draft at the new address
 * already, so the address the site served is read from the page's own row, which only a
 * publish or an unpublish changes (payload/dist/collections/operations/utilities/update.js).
 * A page that was published and then unpublished was last live at its row's address, so
 * publishing it somewhere else moves it from there too.
 */

type Move = { from: string }

const moveKey = (id: number | string) => `pageMove:${id}`

/**
 * The request's context key naming the address whose redirect the page-move hook is making.
 * Only that redirect may start where a starter page is still shown (D-57): a redirect made by
 * hand, or from the 404 log, is refused there (src/collections/Redirects.ts).
 */
export const PAGE_MOVE_REDIRECT = 'pageMoveRedirectFrom'

/** Before a publish: notes the move when the page was live at another address. */
export const noteAddressChange: CollectionBeforeChangeHook = async ({
  context,
  data,
  operation,
  originalDoc,
  req,
}) => {
  const id = (originalDoc as { id?: number | string } | undefined)?.id
  if (operation !== 'update' || id === undefined || data?._status !== 'published') return data
  const row = await req.payload.db.findOne<{
    id: number | string
    slug?: string
    _status?: string
    firstPublishedAt?: string | null
  }>({ collection: 'pages', where: { id: { equals: id } }, req })
  const next = typeof data.slug === 'string' ? data.slug : undefined
  const wasLive = row?._status === 'published' || Boolean(row?.firstPublishedAt)
  if (wasLive && row?.slug && next && row.slug !== next) {
    context[moveKey(id)] = { from: pagePath(row.slug) } satisfies Move
  }
  return data
}

/** After a publish: the redirects follow the page. */
export const redirectOldAddress: CollectionAfterChangeHook = async ({ context, doc, req }) => {
  if (doc?._status !== 'published' || typeof doc.slug !== 'string') return doc
  const key = moveKey(doc.id)
  const move = context[key] as Move | undefined
  delete context[key]

  const plan = planPublish(
    { id: doc.id, address: pagePath(doc.slug), movedFrom: move?.from },
    await readRedirects(req.payload, req),
  )
  if ('refused' in plan) throw new APIError(plan.refused, 400, null, true)
  // In this order, each write passes the redirects' own checks against the ones before it.
  for (const id of plan.remove) {
    await req.payload.delete({ collection: 'redirects', id, overrideAccess: true, req })
  }
  for (const { id, url } of plan.retarget) {
    await req.payload.update({
      collection: 'redirects',
      id,
      data: { to: { type: 'custom', url } },
      overrideAccess: true,
      req,
    })
  }
  if (plan.create) {
    try {
      await req.payload.create({
        collection: 'redirects',
        data: {
          from: plan.create.from,
          to: { type: 'reference', reference: { relationTo: 'pages', value: doc.id } },
          type: '308',
        },
        // The redirect from a moved page's old address goes before a starter page there (D-57).
        context: { [PAGE_MOVE_REDIRECT]: plan.create.from },
        overrideAccess: true,
        req,
      })
    } finally {
      // Payload merges the context into the request's; nothing later in it may pass as a move.
      if (req.context) delete req.context[PAGE_MOVE_REDIRECT]
    }
  }
  return doc
}
