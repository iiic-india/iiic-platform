import {
  commitTransaction,
  initTransaction,
  killTransaction,
  type PayloadRequest,
} from 'payload'

import { POLICY } from '@/access/policy'
import { hasRole, isActive } from '@/access/roles'
import type { Result } from '@/lib/result'

/**
 * Who may act on proposals (CLAUDE.md #6; docs/05 "Send a proposal"), and the transaction every
 * action runs in. A staff session counts only after its two-factor code (payload-totp's strategy).
 */

type Staff = { id: number; collection?: string; _strategy?: string } & Parameters<typeof hasRole>[0]

function staffWithCode(req: PayloadRequest): Staff | null {
  const user = req.user as Staff | null | undefined
  if (!user || user.collection !== 'users' || user._strategy !== 'totp' || !isActive(user)) {
    return null
  }
  return user
}

/** The office (owner or operator) with the code: it makes versions, sends and records answers. */
export function officeUser(req: PayloadRequest): Staff | null {
  const user = staffWithCode(req)
  return user && hasRole(user, ...POLICY.proposals.update.roles) ? user : null
}

/** The staff who read proposals (owner, operator, finance) with the code: previews and PDFs. */
export function readerUser(req: PayloadRequest): Staff | null {
  const user = staffWithCode(req)
  return user && hasRole(user, ...POLICY.proposals.read.roles) ? user : null
}

/**
 * Runs `work` in the request's transaction, opening one if there is none: committed when the
 * work answers ok, rolled back when it answers no or throws. Inside an outer transaction the
 * outer caller commits.
 */
export async function inTransaction<T, E extends { code: string }>(
  req: PayloadRequest,
  work: () => Promise<Result<T, E>>,
): Promise<Result<T, E>> {
  const shouldCommit = await initTransaction(req)
  try {
    const result = await work()
    if (shouldCommit) {
      if (result.ok) await commitTransaction(req)
      else await killTransaction(req)
    }
    return result
  } catch (error) {
    if (shouldCommit) await killTransaction(req)
    throw error
  }
}
