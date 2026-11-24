import 'server-only'

import type { PayloadRequest } from 'payload'

import type {
  CancelQueued,
  Deliver,
  DeliverOptions,
  PlanError,
  PlannedMessage,
  VerifyLink,
} from '@/lib/messaging/operations'
import type { MessageStatus } from '@/lib/messaging/types'
import { err, type Result } from '@/lib/result'

/**
 * The messaging core as builder C's automations reach it (docs/19 §3, §12): `deliver`,
 * `cancelQueued` and `verifyLink`, whose contracts are the foundation's
 * (src/lib/messaging/operations.ts) and whose implementations are builder A's. C's code calls only
 * this port. Since the M6 join the port uses A's functions unless something else is registered:
 * they are loaded on first use (src/lib/messaging/deliver.ts and links.ts), so the jobs config,
 * the pages and the routes all reach the same core without a registration of their own having to
 * run first. Tests register a fake with `useMessagingCore(fake)`, or `null` for no core: then
 * every automation of C plans nothing and says `core-missing` in its job's output, and every
 * signed link reads as not valid.
 */
export type MessagingCore = {
  deliver: Deliver
  cancelQueued: CancelQueued
  verifyLink: VerifyLink
}

export type CoreMissing = { code: 'core-missing' }

/** What a test registered: a fake, or `null` for none. Unset, the port uses A's core. */
let registered: { core: MessagingCore | null } | undefined

/** A's core, loaded when first used: server-only, and never loaded with the config. */
async function joinedCore(): Promise<MessagingCore> {
  const [{ deliver, cancelQueued }, { verifyLink }] = await Promise.all([
    import('@/lib/messaging/deliver'),
    import('@/lib/messaging/links'),
  ])
  return { deliver, cancelQueued, verifyLink }
}

async function current(): Promise<MessagingCore | null> {
  return registered ? registered.core : joinedCore()
}

/** Registers a fake (tests) in place of A's core; `null` takes the core away. */
export function useMessagingCore(core: MessagingCore | null): void {
  registered = { core }
}

/** Whether the core is there: a task without it reports `core-missing` and plans nothing. */
export function hasMessagingCore(): boolean {
  return registered ? registered.core !== null : true
}

export type Planned = { messageId: number; created: boolean; status: MessageStatus }

/**
 * Plans one message through the core: one `messages` row per key, sent when due (fires once).
 * `options.transient` reaches the first try only, and is never stored (src/emails/types.ts).
 */
export async function plan(
  req: PayloadRequest,
  planned: PlannedMessage,
  options?: DeliverOptions,
): Promise<Result<Planned, PlanError | CoreMissing>> {
  const core = await current()
  if (!core) return err({ code: 'core-missing' })
  return core.deliver(req, planned, options)
}

/** Cancels queued messages about a subject; nothing to cancel without the core. */
export async function cancelPlanned(
  req: PayloadRequest,
  scope: Parameters<CancelQueued>[1],
): Promise<number> {
  const core = await current()
  return core ? core.cancelQueued(req, scope) : 0
}

/** Reads a signed link (withdraw, unsubscribe); without the core, no link is valid. */
export const verifySignedLink: VerifyLink = async (purpose, token) => {
  const core = await current()
  return core ? core.verifyLink(purpose, token) : err({ code: 'invalid' })
}
