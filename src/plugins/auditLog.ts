import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionAfterOperationHook,
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

/**
 * Changes to fields a read never returns, by name, keyed by the operation's own data object.
 * Payload hands the object the last beforeChange hook (this plugin's) returns on to afterChange
 * (payload/dist/collections/operations/utilities/update.js), and a nested update has a data
 * object of its own, so a note never reaches another write in the same request.
 */
const hiddenChanges = new WeakMap<object, string[]>()

/**
 * A password is hashed before the write, and a two-factor secret is a field no read returns:
 * both are noted while they are still in the data. Payload fills every field an update leaves
 * out with its stored value, hidden fields included (fields/hooks/beforeValidate), so the secret
 * is in the data of every update: it has changed only when it differs from the stored one, which
 * Payload hands this hook read in the clear, as the data holds it.
 */
const noteHiddenChanges: CollectionBeforeChangeHook = ({ data, operation, originalDoc }) => {
  if (operation !== 'update' || !data) return data
  const stored = (originalDoc as { totpSecret?: unknown } | undefined)?.totpSecret ?? null
  const secretChanged = 'totpSecret' in data && (data.totpSecret ?? null) !== stored
  const names = [
    ...(typeof data.password === 'string' && data.password ? ['password'] : []),
    ...(secretChanged ? ['two-factor'] : []),
  ]
  if (names.length) hiddenChanges.set(data, names)
  return data
}

const afterChange: CollectionAfterChangeHook = async ({
  collection,
  context,
  data,
  doc,
  operation,
  previousDoc,
  req,
}) => {
  const action = typeof context.auditAction === 'string' ? context.auditAction : operation
  const changed =
    operation === 'update' ? changedFields(doc, previousDoc as Record<string, unknown>) : []
  const hidden = (data && hiddenChanges.get(data)) ?? []
  for (const name of hidden) if (!changed.includes(name)) changed.push(name)
  // An update that only moved bookkeeping (a session list, a timestamp) is nobody's change.
  if (operation === 'update' && changed.length === 0 && action === 'update') return doc
  // payload-totp's /api/setup-totp stores the secret without the request (setSecret.js:55-62);
  // only the signed-in person can call it, for their own record.
  const actor =
    req.user ??
    (collection.auth && hidden.includes('two-factor')
      ? { id: doc.id, email: doc.email }
      : undefined)
  await recordAudit(req, { action, entity: collection.slug, entityId: doc.id, changed }, actor)
  return doc
}

const afterDelete: CollectionAfterDeleteHook = async ({ collection, doc, id, req }) => {
  await recordAudit(req, { action: 'delete', entity: collection.slug, entityId: doc?.id ?? id })
  return doc
}

/**
 * The two auth operations that write past every change hook. Payload runs afterOperation after
 * its own commit, so their entries are written right after the change, in a transaction of
 * their own.
 */
const afterAuthOperation: CollectionAfterOperationHook = async (hook) => {
  const { collection, req } = hook
  if (hook.operation === 'resetPassword') {
    // The emailed link: Payload writes past every change hook, commits, then leaves the account
    // as req.user (resetPassword.js:150).
    await recordAudit(req, {
      action: 'reset-password',
      entity: collection.slug,
      entityId: hook.result.user.id as number | string,
      changed: ['password'],
    })
  } else if (hook.operation === 'unlock' && hook.result && !hook.overrideAccess) {
    // An owner's Unlock. An unlock run with access overridden belongs to a named action that is
    // already logged (resetTwoFactor).
    const email = (hook.args.data as { email?: unknown } | undefined)?.email
    const account =
      typeof email === 'string'
        ? await req.payload.db.findOne<{ id: number | string }>({
            collection: collection.slug,
            where: { email: { equals: email.toLowerCase().trim() } },
            req,
          })
        : null
    if (account) {
      await recordAudit(req, { action: 'unlock', entity: collection.slug, entityId: account.id })
    }
  }
  return hook.result
}

/**
 * Adds an audit entry to every change of every collection except NOT_AUDITED (docs/08 §9: every
 * write is in the audit log). Listed last among the plugins, so it sees every collection,
 * those payload-totp adds included. Code that makes a change with a name of its own (an owner's
 * reset of two-factor) sets `req.context.auditAction` before it.
 *
 * An entry is written in the same transaction as the change it records. On a collection with
 * sign-in, two operations write past every change hook: a password reset by the emailed link and
 * an owner's Unlock. Their entries come from an afterOperation hook, which Payload runs after
 * its own commit, so each is written right after the change, in a transaction of its own.
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
              beforeChange: [...(collection.hooks?.beforeChange ?? []), noteHiddenChanges],
              afterChange: [...(collection.hooks?.afterChange ?? []), afterChange],
              afterDelete: [...(collection.hooks?.afterDelete ?? []), afterDelete],
              ...(collection.auth
                ? {
                    afterOperation: [
                      ...(collection.hooks?.afterOperation ?? []),
                      afterAuthOperation,
                    ],
                  }
                : {}),
            },
          },
    ),
  })
}
