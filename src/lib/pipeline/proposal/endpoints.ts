import type { Endpoint, PayloadHandler, PayloadRequest } from 'payload'
import { z } from 'zod'

import type { ProposalError } from '../proposals'
import { PART_LABELS } from './copy'
import { officeUser, readerUser } from './guard'
import type { PrintedPart } from './snapshot'
import { proposals } from './wiring'

/**
 * The proposal actions over the REST API, for the admin's buttons (docs/17 §5, §12). Each handler
 * checks the user, the role and the two-factor code first (CLAUDE.md #6), then the actions check
 * again; input is parsed with Zod; answers carry no contact detail and no amount. Imported by the
 * collections, so not marked server-only (the Payload CLI loads the config outside Next.js).
 */

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }

const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: NO_STORE })

/** What the office reads when an action says no (src/brand/VOICE.md, "Interface copy": errors). */
export const PROPOSAL_MESSAGES = {
  signIn: 'Sign in with your code to do this.',
  role: 'Only an owner or an operator can do this.',
  readRole: 'Only an owner, an operator or finance can open proposals.',
  invalid: 'That request was not complete. Reload the page and try again.',
  'not-found': 'That proposal or version is no longer here. Reload the page.',
  'not-allowed': 'Only an owner or an operator can do this.',
  'bad-move':
    'The proposal’s status does not allow this now. Reload the page to see where it stands.',
  incomplete: 'Fill in these parts first:',
  'fees-hidden':
    'Proposals are not printed while prices are hidden (the prices setting). Nothing was sent.',
  placeholders: 'The proposal still waits for:',
  'no-recipient': 'The lead’s contact has no email address. Add one to their record, then send.',
  'not-sent': 'That version has not been sent.',
  'link-closed': 'That link is already closed.',
} as const

const STATUS: Record<ProposalError['code'], number> = {
  'not-found': 404,
  'not-allowed': 403,
  'bad-move': 409,
  incomplete: 422,
  'fees-hidden': 409,
  placeholders: 422,
  'no-recipient': 422,
  'not-sent': 409,
  'link-closed': 409,
}

/** A refusal as the admin shows it: the message and, where there is one, the list it names. */
export function refusal(error: ProposalError): Response {
  const details =
    error.code === 'incomplete'
      ? error.missing.map((part) => PART_LABELS[part as PrintedPart] ?? part)
      : error.code === 'placeholders'
        ? error.waitingFor
        : []
  return json(
    { code: error.code, message: PROPOSAL_MESSAGES[error.code], details },
    STATUS[error.code],
  )
}

type Gate = 'office' | 'reader'

/** The first check of every handler: who is asking. */
function gate(req: PayloadRequest, who: Gate): Response | null {
  const user = req.user as { collection?: string; _strategy?: string } | null
  if (!user || user.collection !== 'users' || user._strategy !== 'totp') {
    return json({ code: 'sign-in', message: PROPOSAL_MESSAGES.signIn }, 401)
  }
  const allowed = who === 'office' ? officeUser(req) : readerUser(req)
  if (!allowed) {
    const message = who === 'office' ? PROPOSAL_MESSAGES.role : PROPOSAL_MESSAGES.readRole
    return json({ code: 'not-allowed', message }, 403)
  }
  return null
}

const Id = z.coerce.number().int().positive()

function idOf(req: PayloadRequest): number | null {
  const parsed = Id.safeParse(req.routeParams?.id)
  return parsed.success ? parsed.data : null
}

const invalid = () => json({ code: 'invalid', message: PROPOSAL_MESSAGES.invalid }, 400)

/** A page for the office's eyes: no caching, no indexing, no scripts, nothing from elsewhere. */
function htmlPage(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: {
      ...NO_STORE,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy':
        "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; sandbox",
      'Referrer-Policy': 'no-referrer',
    },
  })
}

/** A PDF to read in the browser or save. */
export function pdfResponse(pdf: Uint8Array, filename: string): Response {
  return new Response(pdf as BodyInit, {
    status: 200,
    headers: {
      ...NO_STORE,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Referrer-Policy': 'no-referrer',
    },
  })
}

const createVersion: PayloadHandler = async (req) => {
  const refused = gate(req, 'office')
  if (refused) return refused
  const id = idOf(req)
  if (id === null) return invalid()
  const result = await proposals().createVersion(req, { proposalId: id })
  if (!result.ok) return refusal(result.error)
  return json({ id: result.value.id, number: result.value.number }, 201)
}

const previewProposal: PayloadHandler = async (req) => {
  const refused = gate(req, 'reader')
  if (refused) return refused
  const id = idOf(req)
  if (id === null) return invalid()
  const result = await proposals().preview(req, { proposalId: id })
  return result.ok ? htmlPage(result.value.html) : refusal(result.error)
}

const Answer = z.object({
  answer: z.enum(['accepted', 'declined']),
  note: z.string().trim().max(1000).optional(),
})

const recordAnswer: PayloadHandler = async (req) => {
  const refused = gate(req, 'office')
  if (refused) return refused
  const id = idOf(req)
  const body = Answer.safeParse(await req.json?.().catch(() => null))
  if (id === null || !body.success || !req.user) return invalid()
  const result = await proposals().answer(req, {
    proposalId: id,
    answer: body.data.answer,
    note: body.data.note,
    by: req.user.id as number,
  })
  return result.ok ? json({ id: result.value.proposalId }) : refusal(result.error)
}

const previewVersion: PayloadHandler = async (req) => {
  const refused = gate(req, 'reader')
  if (refused) return refused
  const id = idOf(req)
  if (id === null) return invalid()
  const result = await proposals().preview(req, { versionId: id })
  return result.ok ? htmlPage(result.value.html) : refusal(result.error)
}

const printVersion: PayloadHandler = async (req) => {
  const refused = gate(req, 'reader')
  if (refused) return refused
  const id = idOf(req)
  if (id === null) return invalid()
  const result = await proposals().print(req, { versionId: id })
  return result.ok ? pdfResponse(result.value.pdf, result.value.filename) : refusal(result.error)
}

const sendVersion: PayloadHandler = async (req) => {
  const refused = gate(req, 'office')
  if (refused) return refused
  const id = idOf(req)
  if (id === null || !req.user) return invalid()
  const result = await proposals().send(req, { versionId: id, by: req.user.id as number })
  if (!result.ok) return refusal(result.error)
  // The link is in this answer once, for the office to copy if the email did not go.
  return json({ linkUrl: result.value.linkUrl, mailed: result.value.mailed })
}

const withdrawLink: PayloadHandler = async (req) => {
  const refused = gate(req, 'office')
  if (refused) return refused
  const id = idOf(req)
  if (id === null) return invalid()
  const result = await proposals().withdraw(req, { versionId: id })
  return result.ok ? json({ id: result.value.versionId }) : refusal(result.error)
}

export const proposalEndpoints: Endpoint[] = [
  { path: '/:id/versions', method: 'post', handler: createVersion },
  { path: '/:id/preview', method: 'get', handler: previewProposal },
  { path: '/:id/answer', method: 'post', handler: recordAnswer },
]

export const proposalVersionEndpoints: Endpoint[] = [
  { path: '/:id/preview', method: 'get', handler: previewVersion },
  { path: '/:id/pdf', method: 'get', handler: printVersion },
  { path: '/:id/send', method: 'post', handler: sendVersion },
  { path: '/:id/withdraw', method: 'post', handler: withdrawLink },
]
