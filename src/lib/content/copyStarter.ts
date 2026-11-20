import type { Payload, PayloadHandler, PayloadRequest } from 'payload'
import { z } from 'zod'

import { POLICY } from '@/access/policy'
import { hasRole, isActive } from '@/access/roles'
import { STARTER_PAGES } from '@/content/starter'

import type { PageContent } from './types'

/**
 * Bringing a starter page into the admin (D-54). The site shows a starter page from the
 * repository until its page is published here (D-51); this copies one in as a draft, so that
 * IIIC can approve its candidate lines, fill its placeholders and publish it. The copy is a
 * draft: the site keeps showing the starter page until someone publishes.
 */

const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const strategyOf = (req: PayloadRequest) => (req.user as { _strategy?: string } | null)?._strategy

/** What the endpoint answers when it refuses (src/brand/VOICE.md, "Interface copy": errors). */
export const COPY_STARTER_MESSAGES = {
  signIn: 'Sign in with your code to do this.',
  role: 'Only an owner, an operator or an editor can copy a page here.',
  unknown: 'There is no built page at that address.',
  exists: 'That page is already here.',
} as const

/** The request body: the address of one starter page. */
const CopyRequest = z.object({ slug: z.string().min(1).max(200) })

/** The starter page at a slug. An own-property lookup, so "constructor" finds nothing. */
function starterAt(slug: string): PageContent | undefined {
  return Object.hasOwn(STARTER_PAGES, slug) ? STARTER_PAGES[slug] : undefined
}

/** A starter page as the data of a new draft: every field the page has, and nothing else. */
export function starterPageData(page: PageContent) {
  return {
    title: page.title,
    slug: page.slug,
    layout: page.layout,
    ...(page.description ? { description: page.description } : {}),
    ...(page.facts ? { facts: page.facts } : {}),
    ...(page.legalReview ? { legalReview: page.legalReview } : {}),
    _status: 'draft' as const,
  }
}

/**
 * The starter pages that have no page here yet, draft or published, in the starters' own
 * order. Read past the access rules: it lists addresses only, for staff who may create pages.
 */
export async function starterPagesWaiting(payload: Payload): Promise<PageContent[]> {
  const starters = Object.values(STARTER_PAGES)
  const { docs } = await payload.find({
    collection: 'pages',
    where: { slug: { in: starters.map((page) => page.slug) } },
    limit: starters.length,
    pagination: false,
    depth: 0,
    select: { slug: true },
    overrideAccess: true,
  })
  const taken = new Set(docs.map((doc) => doc.slug))
  return starters.filter((page) => !taken.has(page.slug))
}

/**
 * POST /api/pages/from-starter with { slug }: copies that starter page in as a draft and
 * answers with its id. For staff who may create pages and have entered their two-factor code;
 * the page is then created under the collection's own access rules. A page that is already
 * here is never overwritten: the answer is 409 with the id of the one that exists.
 */
export const copyStarterPage: PayloadHandler = async (req) => {
  const actor = req.user
  if (!actor || actor.collection !== 'users' || strategyOf(req) !== 'totp' || !isActive(actor)) {
    return json({ message: COPY_STARTER_MESSAGES.signIn }, 401)
  }
  if (!hasRole(actor, ...POLICY.pages.create.roles)) {
    return json({ message: COPY_STARTER_MESSAGES.role }, 403)
  }
  const body = CopyRequest.safeParse(await req.json?.().catch(() => null))
  const starter = body.success ? starterAt(body.data.slug) : undefined
  if (!starter) return json({ message: COPY_STARTER_MESSAGES.unknown }, 404)

  const { docs } = await req.payload.find({
    collection: 'pages',
    where: { slug: { equals: starter.slug } },
    limit: 1,
    pagination: false,
    depth: 0,
    select: { slug: true },
    overrideAccess: true,
    req,
  })
  const existing = docs[0]
  if (existing) return json({ message: COPY_STARTER_MESSAGES.exists, id: existing.id }, 409)

  const page = await req.payload.create({
    collection: 'pages',
    data: starterPageData(starter),
    draft: true,
    overrideAccess: false,
    req,
  })
  return json({ id: page.id }, 201)
}
