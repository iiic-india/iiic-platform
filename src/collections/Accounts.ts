import type { CollectionConfig, PayloadHandler, PayloadRequest } from 'payload'
import { z } from 'zod'

import { allow, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { viewRefusal } from '@/access/views'
import { SIGN_IN_CHANNELS } from '@/lib/accounts/contract'
import { IST_FIELD } from '@/lib/time/ist'

/** Written by the server only (src/lib/accounts), never through the API or the admin. */
const serverWritten = { create: () => false, update: () => false }

// ---- The owner's acts on an account (docs/20 §4.7, §6; D-120, D-125) ----

const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const Id = z.coerce.number().int().positive()

/** What the admin is told when an act is refused or finds nothing. Never a person's details. */
const ANSWERS = {
  'sign-in': { status: 401, message: 'Sign in to the admin first.' },
  'enter-code': { status: 403, message: 'Enter your two-factor code first.' },
  'not-allowed': { status: 403, message: 'Only an owner can do this.' },
  refused: { status: 403, message: 'Only an owner can do this, and not on a preview.' },
  'not-found': { status: 404, message: 'There is no such account or record.' },
  'own-record': {
    status: 409,
    message: 'This is the account’s own record. Closing the account detaches it.',
  },
} as const

const answer = (code: keyof typeof ANSWERS) =>
  json({ code, message: ANSWERS[code].message }, ANSWERS[code].status)

/**
 * One endpoint: the staff session, the two-factor code and the owner role first (CLAUDE.md #6;
 * `VIEW_POLICY.accountActions`), before anything is read; then the account's id. The account
 * functions are loaded only when a request arrives, so the Payload CLI, which loads the
 * collections, never loads their `server-only` modules. Answers are never cached.
 */
const ownerAct =
  (run: (req: PayloadRequest, accountId: number) => Promise<Response>): PayloadHandler =>
  async (req) => {
    const refusal = viewRefusal(req.user, 'accountActions')
    if (refusal) return answer(refusal.code)
    const id = Id.safeParse(req.routeParams?.id)
    if (!id.success) return answer('not-found')
    return run(req, id.data)
  }

/** POST /api/accounts/:id/end-sessions: every session of the account ends (D-125). */
const endSessionsHandler = ownerAct(async (req, accountId) => {
  const { endAccountSessions } = await import('@/lib/accounts/lifecycle')
  const result = await endAccountSessions(req, accountId)
  return result.ok
    ? json({ ended: result.value.ended, message: `Sessions ended: ${result.value.ended}.` })
    : answer(result.error.code)
})

/** POST /api/accounts/:id/detach { personId }: a record the person says is not theirs (D-120). */
const detachHandler = ownerAct(async (req, accountId) => {
  const body = (await req.json?.().catch(() => null)) as { personId?: unknown } | null
  const personId = Id.safeParse(body?.personId)
  if (!personId.success) return answer('not-found')
  // The record must be one this account holds.
  const record = await req.payload.findByID({
    collection: 'people',
    id: personId.data,
    depth: 0,
    disableErrors: true,
    select: { account: true },
    overrideAccess: true,
    req,
  })
  const holder = record?.account
  if ((typeof holder === 'object' ? holder?.id : holder) !== accountId) return answer('not-found')
  const { detachRecord } = await import('@/lib/accounts/lifecycle')
  const result = await detachRecord(req, personId.data)
  return result.ok
    ? json({ detached: true, message: 'The record is detached from the account.' })
    : answer(result.error.code)
})

/**
 * A person's My IIIC account (docs/04 `accounts`, S2; docs/20-accounts-design.md §3): the link
 * between Better Auth's user, which holds the verified sign-in details and the sessions in the
 * `customer_auth` schema, and the person's own `people` record. Earlier records of the same
 * person are attached to the account through `people.account` (docs/03 F7; D-120), never merged.
 *
 * Owners read accounts; nobody writes one through the API. The server makes it at the first
 * sign-in (after the account consent, D-113), updates the last sign-in, and deletes it when the
 * person closes the account or an owner confirms an erasure (D-125). Every write is in the audit
 * log (src/plugins/auditLog.ts): one the person makes with the account as its actor
 * (`account:<id>`, from the request's context, D-133), one an owner makes with the owner.
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
  // An owner, with the two-factor code, ends an account's sessions or detaches a record from it.
  endpoints: [
    { path: '/:id/end-sessions', method: 'post', handler: endSessionsHandler },
    { path: '/:id/detach', method: 'post', handler: detachHandler },
  ],
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
