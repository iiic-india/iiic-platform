import type { CollectionConfig } from 'payload'

import { isOwner, isOwnerField, isOwnerOrSelf, isStaff, ROLE_LABELS, ROLES } from '@/access/roles'

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
    tokenExpiration: 60 * 60 * 8,
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
  },
  hooks: {
    beforeChange: [
      async ({ req, operation, data }) => {
        // The first account ever created is the owner who sets everyone else up.
        if (operation === 'create') {
          const { totalDocs } = await req.payload.count({
            collection: 'users',
            req,
            overrideAccess: true,
          })
          if (totalDocs === 0) return { ...data, roles: ['owner'] }
        }
        return data
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
      admin: { description: 'What this person can see and do (docs/05-admin-panel.md).' },
    },
  ],
}
