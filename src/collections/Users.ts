import {
  APIError,
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  type CollectionBeforeLoginHook,
  type CollectionConfig,
} from 'payload'

import { allow, POLICY } from '@/access/policy'
import { hasRole, isOwnerField, ROLE_LABELS, ROLES } from '@/access/roles'
import { resetTwoFactor } from '@/lib/auth/resetTwoFactor'
import { env } from '@/lib/env'
import { mayCreateFirstOwner } from '@/lib/ownerSetup'

/**
 * The first account ever created is the owner who sets everyone else up. On a production
 * server it needs the owner setup link (src/lib/ownerSetup.ts, D-41).
 */
export const firstAccountIsOwner: CollectionBeforeChangeHook = async ({ req, operation, data }) => {
  if (operation !== 'create') return data
  const { totalDocs } = await req.payload.count({
    collection: 'users',
    req,
    overrideAccess: true,
  })
  if (totalDocs > 0) return data
  const config = env()
  const allowed = mayCreateFirstOwner({
    vercelEnv: config.VERCEL_ENV,
    nodeEnv: config.NODE_ENV,
    expectedToken: config.OWNER_SETUP_TOKEN,
    cookieHeader: req.headers.get('cookie'),
  })
  if (!allowed) {
    throw new APIError('Open the owner setup link to create the first account.', 403)
  }
  return { ...data, roles: ['owner'] }
}

const DEACTIVATED = 'This account is deactivated. An owner can turn it back on.'

/**
 * A deactivated account cannot sign in (docs/05, "Who uses it"). Payload's sign-in writes back
 * the whole row it read when it started, so a deactivation committed in between would be
 * undone; the flag is therefore read again outside the sign-in's transaction, and refusing
 * rolls that write back.
 */
export const refuseDeactivated: CollectionBeforeLoginHook = async ({ req, user }) => {
  if (user?.active === false) throw new APIError(DEACTIVATED, 403)
  const committed = await req.payload.db.findOne<{ id: number | string; active?: boolean | null }>({
    collection: 'users',
    where: { id: { equals: user.id } },
    select: { active: true },
  })
  if (committed?.active === false) throw new APIError(DEACTIVATED, 403)
  return user
}

/**
 * The platform always keeps one active owner, so someone can still manage staff: the last
 * active owner can be neither deactivated nor stripped of the owner role.
 */
export const keepAnActiveOwner: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation !== 'update' || !originalDoc) return data
  const wasActiveOwner = originalDoc.active !== false && originalDoc.roles?.includes('owner')
  if (!wasActiveOwner) return data
  const roles: string[] | undefined = data.roles ?? originalDoc.roles
  const active: boolean | undefined = data.active ?? originalDoc.active
  if (active !== false && roles?.includes('owner')) return data
  const { totalDocs } = await req.payload.count({
    collection: 'users',
    where: {
      and: [
        { id: { not_equals: originalDoc.id } },
        { roles: { in: ['owner'] } },
        { active: { equals: true } },
      ],
    },
    overrideAccess: true,
    req,
  })
  if (totalDocs === 0) {
    throw new APIError('Keep at least one active owner. Make someone else an owner first.', 400)
  }
  return data
}

/**
 * Deactivating someone ends their open sessions at once (docs/05): the JWT strategy accepts a
 * token only while its session is listed on the user, so clearing the list signs them out
 * everywhere. Runs in the same transaction as the change.
 */
export const endSessionsOnDeactivation: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  if (operation !== 'update' || previousDoc?.active === false || doc.active !== false) return doc
  await req.payload.update({
    collection: 'users',
    id: doc.id,
    data: { sessions: [] },
    overrideAccess: true,
    req,
  })
  return doc
}

/**
 * Staff accounts for /admin: identity, roles, deactivation and safe sessions. Access comes
 * from src/access/policy.ts (docs/05); TOTP two-factor from payload-totp (src/lib/auth/totp.ts),
 * which adds its fields, views and endpoints to this collection.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Staff user', plural: 'Staff users' },
  // One account at a time: a bulk edit runs every record's checks before any write, so it
  // could take away the last active owner. Payload refuses bulk updates here outright.
  disableBulkEdit: true,
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['name', 'email', 'roles', 'active'],
    group: 'Settings',
    // Only owners manage staff; everyone else opens their own account from the account menu.
    hidden: ({ user }) => !hasRole(user, 'owner'),
  },
  auth: {
    useSessions: true,
    // 12-hour sessions (docs/08 §9).
    tokenExpiration: 60 * 60 * 12,
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    cookies: {
      sameSite: 'Lax',
      secure: process.env.NODE_ENV === 'production',
    },
  },
  access: {
    read: allow(POLICY.users.read),
    create: allow(POLICY.users.create),
    update: allow(POLICY.users.update),
    delete: allow(POLICY.users.delete),
    // Only an owner unlocks a locked account (Payload's default lets any staff user).
    unlock: allow(POLICY.users.unlock),
  },
  hooks: {
    beforeLogin: [refuseDeactivated],
    beforeChange: [firstAccountIsOwner, keepAnActiveOwner],
    afterChange: [endSessionsOnDeactivation],
  },
  endpoints: [{ path: '/:id/reset-two-factor', method: 'post', handler: resetTwoFactor }],
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      required: true,
      saveToJWT: true,
      options: ROLES.map((value) => ({ value, label: ROLE_LABELS[value] })),
      access: { update: isOwnerField },
      admin: { description: 'What this person can see and do.' },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      access: { update: isOwnerField },
      admin: {
        position: 'sidebar',
        description:
          'Untick to deactivate the account: signing in is refused and open sessions end at once.',
      },
    },
    {
      // Owners only, on someone else's record (src/components/admin/ResetTwoFactor.tsx).
      name: 'resetTwoFactor',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: { Field: '/components/admin/ResetTwoFactor#ResetTwoFactor' },
      },
    },
  ],
}
