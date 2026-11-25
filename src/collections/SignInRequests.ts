import type { CollectionConfig } from 'payload'

import { allow, POLICY } from '@/access/policy'
import { SIGN_IN_CHANNELS } from '@/lib/accounts/contract'

/**
 * One row per sign-in code asked for (docs/20-accounts-design.md §4.8; D-116). It holds no
 * address: the address typed is kept as a keyed hash (an HMAC under a key derived from
 * BETTER_AUTH_SECRET for this alone), the network address as the day's keyed hash the public
 * forms already use (src/lib/enquiryForms/guards.ts), and the times. The rate limits count these
 * rows, so a request that was refused stores nothing and counts for nothing (as D-92, D-108).
 * The row is also what the code's message (A1) is about, so the message log says a code went
 * without naming anyone (hook H3, docs/20 §12). The code itself is never stored here.
 *
 * No one reads or writes these through the API or the admin; the server writes them and purges
 * them after SIGN_IN_REQUEST_KEEP_HOURS. Left out of the audit log, like the analytics events:
 * bookkeeping that holds no one's details (src/plugins/auditLog.ts).
 */
export const SignInRequests: CollectionConfig = {
  slug: 'sign-in-requests',
  labels: { singular: 'Sign-in request', plural: 'Sign-in requests' },
  admin: { hidden: true },
  access: {
    read: allow(POLICY.signInRequests.read),
    create: allow(POLICY.signInRequests.create),
    update: allow(POLICY.signInRequests.update),
    delete: allow(POLICY.signInRequests.delete),
  },
  defaultSort: '-requestedAt',
  disableBulkEdit: true,
  lockDocuments: false,
  timestamps: false,
  indexes: [
    { fields: ['identifierHash', 'requestedAt'] },
    { fields: ['networkHash', 'requestedAt'] },
  ],
  fields: [
    {
      name: 'purpose',
      type: 'select',
      required: true,
      options: [
        { value: 'signIn', label: 'Signing in' },
        { value: 'addDetail', label: 'Adding a contact detail' },
      ],
    },
    { name: 'channel', type: 'select', required: true, options: [...SIGN_IN_CHANNELS] },
    { name: 'identifierHash', type: 'text', required: true, maxLength: 64 },
    { name: 'networkHash', type: 'text', required: true, maxLength: 64 },
    // UTC (CLAUDE.md #8); the row is never shown, so it keeps no time zone beside it.
    { name: 'requestedAt', type: 'date', required: true, index: true },
  ],
}
