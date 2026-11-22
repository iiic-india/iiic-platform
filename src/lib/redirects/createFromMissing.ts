import {
  commitTransaction,
  initTransaction,
  killTransaction,
  type PayloadHandler,
  type PayloadRequest,
  ValidationError,
} from 'payload'
import { z } from 'zod'

import { POLICY } from '@/access/policy'
import { hasRole, isActive } from '@/access/roles'

import { MAX_PATH_LENGTH, type RedirectStatus } from './paths'

/**
 * "Create redirect" in the 404 log (docs/05, Content → Broken links; docs/11 §5.1, item 9): one
 * click sends an address visitors keep asking for on to an address on this site, and marks its
 * entry resolved. Both happen in one transaction, under the collections' own access rules and
 * checks, so a refused redirect leaves the entry as it was.
 */

const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/** What the endpoint answers when it refuses (src/brand/VOICE.md, "Interface copy": errors). */
export const CREATE_REDIRECT_MESSAGES = {
  signIn: 'Sign in with your code to do this.',
  role: 'Only an owner, an operator or an editor can make a redirect.',
  unknown: 'That address is no longer in the log.',
  resolved: 'That address already has a redirect.',
  invalid: 'Choose a page on this site to send visitors to, such as /about.',
} as const

/** The request body: where the address should lead, and for how long. */
const CreateRedirect = z.object({
  to: z.string().trim().min(1).max(MAX_PATH_LENGTH),
  statusCode: z.enum(['308', '307'] satisfies RedirectStatus[]).optional(),
})

const strategyOf = (req: PayloadRequest) => (req.user as { _strategy?: string } | null)?._strategy

/**
 * POST /api/missing-pages/:id/redirect with { to, statusCode? }: creates the redirect from the
 * entry's address to that address and links it to the entry, answering with the redirect. For
 * staff who may make redirects and have entered their two-factor code.
 */
export const createRedirectFromMissingPage: PayloadHandler = async (req) => {
  const actor = req.user
  if (!actor || actor.collection !== 'users' || strategyOf(req) !== 'totp' || !isActive(actor)) {
    return json({ message: CREATE_REDIRECT_MESSAGES.signIn }, 401)
  }
  if (!hasRole(actor, ...POLICY.redirects.create.roles)) {
    return json({ message: CREATE_REDIRECT_MESSAGES.role }, 403)
  }
  const id = req.routeParams?.id
  const body = CreateRedirect.safeParse(await req.json?.().catch(() => null))
  if ((typeof id !== 'string' && typeof id !== 'number') || !body.success) {
    return json({ message: CREATE_REDIRECT_MESSAGES.invalid }, 400)
  }

  const shouldCommit = await initTransaction(req)
  try {
    const entry = await req.payload.findByID({
      collection: 'missing-pages',
      id,
      depth: 0,
      disableErrors: true,
      overrideAccess: false,
      req,
    })
    if (!entry) {
      await killTransaction(req)
      return json({ message: CREATE_REDIRECT_MESSAGES.unknown }, 404)
    }
    if (entry.resolved) {
      await killTransaction(req)
      return json({ message: CREATE_REDIRECT_MESSAGES.resolved }, 409)
    }
    const redirect = await req.payload.create({
      collection: 'redirects',
      data: {
        from: entry.path,
        to: { type: 'custom', url: body.data.to },
        type: body.data.statusCode ?? '308',
      },
      overrideAccess: false,
      req,
    })
    await req.payload.update({
      collection: 'missing-pages',
      id: entry.id,
      data: { resolved: redirect.id },
      overrideAccess: false,
      req,
    })
    if (shouldCommit) await commitTransaction(req)
    return json({ id: redirect.id, from: redirect.from, to: redirect.to?.url ?? null }, 201)
  } catch (error) {
    await killTransaction(req)
    if (error instanceof ValidationError) {
      return json({ message: error.data.errors.map(({ message }) => message).join(' ') }, 400)
    }
    throw error
  }
}
