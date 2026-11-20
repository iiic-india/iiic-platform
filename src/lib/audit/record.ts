import type { PayloadRequest } from 'payload'

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
 * records. The actor is whoever made the request; none for the system.
 */
export async function recordAudit(req: PayloadRequest, entry: AuditEntry): Promise<void> {
  const actor = req.user as { id?: number | string; email?: string } | null | undefined
  await req.payload.create({
    collection: 'audit-log',
    data: {
      at: new Date().toISOString(),
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
