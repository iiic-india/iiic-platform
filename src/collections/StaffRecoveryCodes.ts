import type { CollectionConfig } from 'payload'

/**
 * Salted PBKDF2 hashes of staff recovery codes (src/lib/auth/recoveryCodes.ts). Nobody reads or
 * writes them through the API or the admin: only the Users endpoints that create and use codes
 * touch this collection, with access overridden.
 */
export const StaffRecoveryCodes: CollectionConfig = {
  slug: 'staff-recovery-codes',
  admin: { hidden: true },
  access: {
    read: () => false,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'codeHash', type: 'text', required: true, unique: true },
    { name: 'usedAt', type: 'date' },
  ],
}
