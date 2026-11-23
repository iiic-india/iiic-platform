import 'server-only'

import {
  commitTransaction,
  initTransaction,
  killTransaction,
  type PayloadHandler,
  type PayloadRequest,
} from 'payload'
import { z } from 'zod'

import { POLICY } from '@/access/policy'
import { hasRole, isActive } from '@/access/roles'
import { recordAudit } from '@/lib/audit/record'

import { move } from './store'

/**
 * "Queue again" in the message log (docs/05 Messages → Log; docs/19 §3): a message that failed,
 * or whose send never answered, goes back in the queue to be tried at once with its tries counted
 * afresh. Owners and the office only, with their two-factor code entered; the move is a
 * conditional update, so two clicks queue it once, and it is written to the audit log in the same
 * transaction. A message with no answer may have reached the person: the log says so beside it.
 */

const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/** What the endpoint answers when it refuses (src/brand/VOICE.md, "Interface copy": errors). */
export const QUEUE_AGAIN_MESSAGES = {
  signIn: 'Sign in with your code to do this.',
  role: 'Only an owner or the office can queue a message again.',
  unknown: 'That message is no longer in the log.',
  state: 'Only a failed message, or one whose send had no answer, can be queued again.',
  invalid: 'That is not a message in the log.',
} as const

const MessageId = z.coerce.number().int().positive()

const strategyOf = (req: PayloadRequest) => (req.user as { _strategy?: string } | null)?._strategy

/** POST /api/messages/:id/queue-again: answers with the message's id and its new status. */
export const queueAgain: PayloadHandler = async (req) => {
  const actor = req.user
  if (!actor || actor.collection !== 'users' || strategyOf(req) !== 'totp' || !isActive(actor)) {
    return json({ message: QUEUE_AGAIN_MESSAGES.signIn }, 401)
  }
  if (!hasRole(actor, ...POLICY.messages.read.roles)) {
    return json({ message: QUEUE_AGAIN_MESSAGES.role }, 403)
  }
  const id = MessageId.safeParse(req.routeParams?.id)
  if (!id.success) return json({ message: QUEUE_AGAIN_MESSAGES.invalid }, 400)

  const shouldCommit = await initTransaction(req)
  try {
    const message = await req.payload.findByID({
      collection: 'messages',
      id: id.data,
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
      select: { status: true },
      req,
    })
    if (!message) {
      await killTransaction(req)
      return json({ message: QUEUE_AGAIN_MESSAGES.unknown }, 404)
    }
    const now = new Date()
    const moved = await move(
      req,
      id.data,
      ['failed', 'unknown'],
      'queued',
      { sendAt: now, resetAttempts: true, lastError: null, skipReason: null },
      now,
    )
    if (!moved) {
      await killTransaction(req)
      return json({ message: QUEUE_AGAIN_MESSAGES.state }, 409)
    }
    await recordAudit(req, {
      action: 'queue-again',
      entity: 'messages',
      entityId: id.data,
      changed: ['status', 'sendAt', 'attempts', 'lastError'],
    })
    if (shouldCommit) await commitTransaction(req)
    return json({ id: id.data, status: 'queued' })
  } catch (error) {
    await killTransaction(req)
    throw error
  }
}
