import type { PayloadRequest } from 'payload'

import { contextActor } from './actor'

export type AuditEntry = {
  /** create, update or delete, or a named action such as `reset-two-factor`. */
  action: string
  /** The collection slug. */
  entity: string
  entityId?: number | string
  /** Field names only; values never go into the log. */
  changed?: string[]
}

/** The client's address as Vercel passes it (the first `x-forwarded-for` entry), if any. */
export function clientIp(req: PayloadRequest): string | undefined {
  const forwarded = req.headers?.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || req.headers?.get('x-real-ip') || undefined
}

/**
 * Writes one audit entry in the request's transaction, so it stands or falls with the change it
 * records. The actor is whoever made the request: its Payload user (staff), else the My IIIC
 * account the request acts for (`account:<id>`, from `req.context.auditActor`; D-133); unless the
 * caller names one (a write Payload makes without the request, src/plugins/auditLog.ts). None for
 * the system, and none when the caller passes null.
 */
export async function recordAudit(
  req: PayloadRequest,
  entry: AuditEntry,
  actor: { id?: number | string; email?: string | null } | null | undefined = (req.user as {
    id?: number | string
    email?: string
  } | null) ?? contextActor(req),
): Promise<void> {
  await req.payload.create({
    collection: 'audit-log',
    data: {
      at: new Date().toISOString(),
      // Shown in Asia/Kolkata in the admin (src/collections/AuditLog.ts, CLAUDE.md #8).
      at_tz: 'Asia/Kolkata',
      actorId: actor?.id === undefined ? undefined : String(actor.id),
      actorEmail: actor?.email,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId === undefined ? undefined : String(entry.entityId),
      changed: entry.changed?.length ? entry.changed.join(', ') : undefined,
      ip: clientIp(req),
    },
    overrideAccess: true,
    req,
  })
}
