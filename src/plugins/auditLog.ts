import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeChangeHook,
  Config,
} from 'payload'

import { recordAudit } from '@/lib/audit/record'

/**
 * Collections that hold no one's change: the log itself, Payload's and payload-totp's own
 * bookkeeping, and the recovery codes, whose endpoints write one entry per action instead of
 * one per code (src/lib/auth/recoveryEndpoints.ts).
 */
const NOT_AUDITED = new Set([
  'audit-log',
  'payload-preferences',
  'payload-migrations',
  'payload-locked-documents',
  'payload-kv',
  'payload-jobs',
  'payload-query-presets',
  'payload-folders',
  'totp-attempts',
  'staff-recovery-codes',
])

/** Bookkeeping that changes without anyone deciding it. */
const BOOKKEEPING = new Set([
  'createdAt',
  'updatedAt',
  'sessions',
  'loginAttempts',
  'lockUntil',
  'resetPasswordToken',
  'resetPasswordExpiration',
])

/** The names the log uses for fields whose own names say little. */
const LABELS: Record<string, string> = { hasTotp: 'two-factor' }

/**
 * The fields that differ between two versions of a document, by name. A field missing from
 * either version (a hidden field the read left out) is not compared.
 */
export function changedFields(
  doc: Record<string, unknown>,
  previous: Record<string, unknown> | undefined,
): string[] {
  if (!previous) return []
  return Object.keys(doc)
    .filter((key) => !BOOKKEEPING.has(key) && key !== 'id' && key in previous)
    .filter((key) => JSON.stringify(doc[key]) !== JSON.stringify(previous[key]))
    .map((key) => LABELS[key] ?? key)
}

/** A password is hashed before the write, so the change is noted while it is still in the data. */
const notePassword: CollectionBeforeChangeHook = ({ data, operation, context }) => {
  if (operation === 'update' && typeof data?.password === 'string' && data.password) {
    context.auditPassword = true
  }
  return data
}

const afterChange: CollectionAfterChangeHook = async ({
  collection,
  context,
  doc,
  operation,
  previousDoc,
  req,
}) => {
  const action = typeof context.auditAction === 'string' ? context.auditAction : operation
  const changed =
    operation === 'update' ? changedFields(doc, previousDoc as Record<string, unknown>) : []
  if (context.auditPassword) changed.push('password')
  // An update that only moved bookkeeping (a session list, a timestamp) is nobody's change.
  if (operation === 'update' && changed.length === 0 && action === 'update') return doc
  await recordAudit(req, { action, entity: collection.slug, entityId: doc.id, changed })
  return doc
}

const afterDelete: CollectionAfterDeleteHook = async ({ collection, doc, id, req }) => {
  await recordAudit(req, { action: 'delete', entity: collection.slug, entityId: doc?.id ?? id })
  return doc
}

/**
 * Adds an audit entry to every change of every collection except NOT_AUDITED (docs/08 §9: every
 * write is in the audit log). Listed last among the plugins, so it sees every collection,
 * those payload-totp adds included. Code that makes a change with a name of its own (an owner's
 * reset of two-factor) sets `req.context.auditAction` before it.
 */
export function auditLog() {
  return (config: Config): Config => ({
    ...config,
    collections: (config.collections ?? []).map((collection) =>
      NOT_AUDITED.has(collection.slug)
        ? collection
        : {
            ...collection,
            hooks: {
              ...collection.hooks,
              beforeChange: [...(collection.hooks?.beforeChange ?? []), notePassword],
              afterChange: [...(collection.hooks?.afterChange ?? []), afterChange],
              afterDelete: [...(collection.hooks?.afterDelete ?? []), afterDelete],
            },
          },
    ),
  })
}
