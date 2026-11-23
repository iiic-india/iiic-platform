import 'server-only'

import type { PayloadRequest } from 'payload'

import type {
  CancelQueued,
  Deliver,
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
 * this port, so it builds and is tested before A's files are joined: until then the port answers
 * `core-missing`, every automation of C plans nothing and says so in its job's output, and every
 * signed link reads as not valid. At the join, one call registers A's functions
 * (`useMessagingCore({ deliver, cancelQueued, verifyLink })` where the jobs config loads them);
 * tests register fakes the same way.
 */
export type MessagingCore = {
  deliver: Deliver
  cancelQueued: CancelQueued
  verifyLink: VerifyLink
}

export type CoreMissing = { code: 'core-missing' }

let joined: MessagingCore | null = null

/** Registers the core (the join) or a fake (tests); `null` takes it away again. */
export function useMessagingCore(core: MessagingCore | null): void {
  joined = core
}

/** Whether the core is there: a task without it reports `core-missing` and plans nothing. */
export function hasMessagingCore(): boolean {
  return joined !== null
}

export type Planned = { messageId: number; created: boolean; status: MessageStatus }

/** Plans one message through the core: one `messages` row per key, sent when due (fires once). */
export async function plan(
  req: PayloadRequest,
  planned: PlannedMessage,
): Promise<Result<Planned, PlanError | CoreMissing>> {
  if (!joined) return err({ code: 'core-missing' })
  return joined.deliver(req, planned)
}

/** Cancels queued messages about a subject; nothing to cancel without the core. */
export async function cancelPlanned(
  req: PayloadRequest,
  scope: Parameters<CancelQueued>[1],
): Promise<number> {
  return joined ? joined.cancelQueued(req, scope) : 0
}

/** Reads a signed link (withdraw, unsubscribe); without the core, no link is valid. */
export const verifySignedLink: VerifyLink = async (purpose, token) =>
  joined ? joined.verifyLink(purpose, token) : err({ code: 'invalid' })
