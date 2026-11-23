import type { PayloadRequest } from 'payload'

import { hasRole, type MaybeStaff, type Role } from '@/access/roles'

/**
 * Who a pipeline write is by (docs/17 §3, §4): a member of the staff in the admin, or the
 * platform's own operations, which say on whose behalf they act (`by`, empty for the platform
 * itself). The collections' hooks read it to stamp `by`, `touchedAt` and `doneBy`, and to hold
 * staff to the entries and moves that are theirs. Free of `server-only`: the hooks use it.
 */

/** The flag a platform write carries on its request while it runs. */
export const PLATFORM_WRITE = 'pipelinePlatformWrite'

type PlatformWrite = { by: number | null }

function contextOf(req: PayloadRequest): Record<string, unknown> {
  if (!req.context) req.context = {}
  return req.context as Record<string, unknown>
}

/**
 * Runs `work` as a platform write on behalf of `by` (null for the platform itself). The flag is
 * taken off again afterwards, so the rest of the request is not read as the platform's.
 */
export async function asPlatform<T>(
  req: PayloadRequest,
  by: number | null,
  work: () => Promise<T>,
): Promise<T> {
  const previous = contextOf(req)[PLATFORM_WRITE]
  contextOf(req)[PLATFORM_WRITE] = { by } satisfies PlatformWrite
  try {
    return await work()
  } finally {
    if (previous === undefined) delete contextOf(req)[PLATFORM_WRITE]
    else contextOf(req)[PLATFORM_WRITE] = previous
  }
}

/** Who a write is by: the platform write's `by`, else the signed-in user, else nobody. */
export function actorOf(req: PayloadRequest): { platform: boolean; by: number | null } {
  const platform = req.context?.[PLATFORM_WRITE] as PlatformWrite | undefined
  if (platform) return { platform: true, by: platform.by }
  const id = req.user?.id
  return { platform: false, by: typeof id === 'number' ? id : null }
}

/** Whether a write comes from a member of the staff in the admin or the API, not the platform. */
export function isStaffWrite(req: PayloadRequest): boolean {
  return !req.context?.[PLATFORM_WRITE] && Boolean(req.user)
}

/** Whether the request's user holds one of the roles and has entered their two-factor code. */
export function staffWithCode(user: unknown, roles: readonly Role[]): boolean {
  const strategy = (user as { _strategy?: string } | null | undefined)?._strategy
  return strategy === 'totp' && hasRole(user as MaybeStaff, ...roles)
}

/** A relationship's id, whether it holds the id or the document. */
export function idOf(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'number') {
    return (value as { id: number }).id
  }
  return null
}
