import type { CollectionConfig } from 'payload'

import { allow, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { SIGN_IN_CHANNELS } from '@/lib/accounts/contract'
import { IST_FIELD } from '@/lib/time/ist'

/** Written by the server only (src/lib/accounts), never through the API or the admin. */
const serverWritten = { create: () => false, update: () => false }

/**
 * A person's My IIIC account (docs/04 `accounts`, S2; docs/20-accounts-design.md §3): the link
 * between Better Auth's user, which holds the verified sign-in details and the sessions in the
 * `customer_auth` schema, and the person's own `people` record. Earlier records of the same
 * person are attached to the account through `people.account` (docs/03 F7; D-122), never merged.
 *
 * Owners read accounts; nobody writes one through the API. The server makes it at the first
 * sign-in (after the account consent, D-115), updates the last sign-in, and deletes it when the
 * person closes the account or an owner confirms an erasure (D-127). Every write is in the audit
 * log (src/plugins/auditLog.ts) with the account as its actor (`account:<id>`).
 */
export const Accounts: CollectionConfig = {
  slug: 'accounts',
  labels: { singular: 'My IIIC account', plural: 'My IIIC accounts' },
  admin: {
    group: 'People',
    useAsTitle: 'id',
    defaultColumns: ['person', 'createdAt', 'lastSignInAt'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.accounts.read.roles),
    description:
      'Accounts people made to sign in to My IIIC. Their sign-in details and sessions are kept by the sign-in service, not here.',
  },
  access: {
    read: allow(POLICY.accounts.read),
    create: allow(POLICY.accounts.create),
    update: allow(POLICY.accounts.update),
    delete: allow(POLICY.accounts.delete),
  },
  defaultSort: '-createdAt',
  disableBulkEdit: true,
  fields: [
    {
      // Better Auth's user id (`customer_auth.users.id`). Empty only between the account step's
      // records and Better Auth's user being made (docs/20 §4.5); the next sign-in fills it.
      name: 'authUserId',
      type: 'text',
      unique: true,
      index: true,
      maxLength: 64,
      access: serverWritten,
      admin: { readOnly: true, description: 'The sign-in service’s id for this account.' },
    },
    {
      // The account's own record: the one whose email or mobile is marked verified (docs/04).
      name: 'person',
      type: 'relationship',
      relationTo: 'people',
      required: true,
      unique: true,
      index: true,
      access: serverWritten,
      admin: { readOnly: true },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'lastSignInAt',
          type: 'date',
          label: 'Last sign-in',
          timezone: IST_FIELD,
          access: serverWritten,
          admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
        },
        {
          name: 'lastSignInChannel',
          type: 'select',
          label: 'Last signed in by',
          options: SIGN_IN_CHANNELS.map((value) => ({
            value,
            label: value === 'email' ? 'Email code' : 'WhatsApp code',
          })),
          access: serverWritten,
          admin: { readOnly: true },
        },
      ],
    },
    {
      // Every record the account holds: its own and the earlier ones attached (docs/03 F7).
      name: 'records',
      type: 'join',
      collection: 'people',
      on: 'account',
      admin: {
        allowCreate: false,
        defaultColumns: ['fullName', 'createdAt'],
        description: 'The records of this person that My IIIC shows: their own and earlier ones.',
      },
    },
  ],
}
