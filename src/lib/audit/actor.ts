import type { PayloadRequest } from 'payload'

import type { AccountActor } from '@/lib/accounts/contract'

declare module 'payload' {
  interface RequestContext {
    /**
     * The My IIIC account a customer's request acts for (docs/20 §8; D-133), set by the one
     * request builder (`accountRequest` in src/lib/accounts/scope.ts) or by the sign-in steps once
     * the account is known. The audit log names it as the actor of every write made on the
     * request when the request has no Payload user: customers are never staff (D-127).
     */
    auditActor?: AccountActor
  }
}

const ACCOUNT_ACTOR = /^account:\d+$/

/**
 * Names the account as the actor of every write made on this request from here on: for the
 * sign-in steps, which learn the account only once a code has proven its detail.
 */
export function setAuditActor(req: Pick<PayloadRequest, 'context'>, actor: AccountActor): void {
  req.context = { ...req.context, auditActor: actor }
}

/**
 * The account a request's context names as the actor of a customer's write, when it is one:
 * `account:<id>` and nothing else, so a context that carries anything other than an account's
 * own words names no actor at all. Pure, free of `server-only`: the audit plugin is loaded by the
 * Payload CLI too.
 */
export function contextActor(req: Pick<PayloadRequest, 'context'>): AccountActor | undefined {
  const actor: unknown = req.context?.auditActor
  if (!actor || typeof actor !== 'object') return undefined
  const id = (actor as { id?: unknown }).id
  return typeof id === 'string' && ACCOUNT_ACTOR.test(id)
    ? { id: id as AccountActor['id'] }
    : undefined
}
