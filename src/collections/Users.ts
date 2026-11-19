import { APIError, type CollectionConfig } from 'payload'

import { isOwner, isOwnerField, isOwnerOrSelf, isStaff, ROLE_LABELS, ROLES } from '@/access/roles'
import { env } from '@/lib/env'
import { mayCreateFirstOwner } from '@/lib/ownerSetup'

/**
 * Staff accounts for /admin. Milestone 1 slice 1: identity, roles and safe session
 * settings. TOTP two-factor, deactivation and the role-by-role access rules from
 * docs/05 arrive in the next slices (docs/10, M1).
 */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Staff user', plural: 'Staff users' },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['name', 'email', 'roles'],
    group: 'Settings',
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
    read: isStaff,
    create: isOwner,
    update: isOwnerOrSelf,
    delete: isOwner,
    // Only an owner unlocks a locked account (Payload's default lets any staff user).
    unlock: isOwner,
  },
  hooks: {
    beforeChange: [
      async ({ req, operation, data }) => {
        if (operation !== 'create') return data
        const { totalDocs } = await req.payload.count({
          collection: 'users',
          req,
          overrideAccess: true,
        })
        if (totalDocs > 0) return data
        // The first account ever created is the owner who sets everyone else up. On
        // production it needs the owner setup link (src/lib/ownerSetup.ts, D-41).
        const config = env()
        const allowed = mayCreateFirstOwner({
          api: req.payloadAPI,
          vercelEnv: config.VERCEL_ENV,
          expectedToken: config.OWNER_SETUP_TOKEN,
          cookieHeader: req.headers.get('cookie'),
        })
        if (!allowed) {
          throw new APIError('Open the owner setup link to create the first account.', 403)
        }
        return { ...data, roles: ['owner'] }
      },
    ],
  },
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
  ],
}
