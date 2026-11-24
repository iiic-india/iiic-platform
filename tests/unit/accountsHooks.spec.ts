// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { CONSENT_PURPOSES, ENDED_IN_MY_IIIC } from '@/lib/privacy/purposes'
import { RECIPIENT_KINDS, SUBJECT_COLLECTIONS } from '@/lib/messaging/types'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/accounts/purge', () => ({
  purgeSignIns: vi.fn(async () => ({ requests: 2, sessions: 1, codes: 3 })),
}))

const { recipientFacts, signInFacts, NO_RECIPIENT } = await import('@/lib/messaging/recipients')
const { runO5 } = await import('@/lib/automations/operations/run')
const { purgeSignIns } = await import('@/lib/accounts/purge')
const { recipientOf } = await import('@/lib/messaging/try')
const { IMPLEMENTATIONS } = await import('@/emails')

// The hooks Release 2's accounts need in the code M6 and M5 built (docs/20 §12): the account
// consent purpose (H1), a sign-in code's recipient, whose address comes only from the first try
// (H2, H3), and the account templates' place in the registry's map (H5). Fake addresses only.

/** A request whose database must not be touched: a sign-in code's address is read from nothing. */
const untouchable = new Proxy(
  {},
  {
    get(_target, key) {
      throw new Error(`the sign-in recipient read req.${String(key)}`)
    },
  },
) as never

describe('H1 · the account consent', () => {
  it('is a purpose of the ledger, ended in My IIIC rather than by the withdraw link (D-113)', () => {
    expect(CONSENT_PURPOSES.map(({ value }) => value)).toContain('account')
    expect(ENDED_IN_MY_IIIC).toEqual(['account'])
  })
})

describe('H2, H3 · a sign-in code’s recipient', () => {
  it('is its sign-in request, a subject that names nobody', () => {
    expect(SUBJECT_COLLECTIONS).toContain('sign-in-requests')
    expect(SUBJECT_COLLECTIONS).toContain('accounts')
    expect(RECIPIENT_KINDS.map(({ value }) => value)).toContain('signIn')
    expect(
      recipientOf({
        recipientKind: 'signIn',
        person: null,
        subscriber: null,
        staff: null,
        subjectCollection: 'sign-in-requests',
        subjectId: 41,
      }),
    ).toEqual({ kind: 'signIn', id: 41 })
    // A row that says sign-in but is about anything else has no one to go to.
    expect(
      recipientOf({
        recipientKind: 'signIn',
        person: 7,
        subscriber: null,
        staff: null,
        subjectCollection: 'bookings',
        subjectId: 41,
      }),
    ).toBeNull()
  })

  it('takes the address from the first try only, and reads no record for it', async () => {
    const first = await recipientFacts(untouchable, { kind: 'signIn', id: 41 }, 'email', {
      address: 'Someone@Example.invalid',
      code: '123456',
    })
    expect(first).toEqual({ ...NO_RECIPIENT, address: 'someone@example.invalid' })
    // A retry, or the dispatcher, has no `transient`: no address, so nothing goes twice.
    expect(await recipientFacts(untouchable, { kind: 'signIn', id: 41 }, 'email')).toEqual(
      NO_RECIPIENT,
    )
  })

  it('wants an email on the email channel and a mobile in E.164 on WhatsApp', () => {
    expect(signInFacts('whatsapp', { address: '+919000000000' }).address).toBe('+919000000000')
    expect(signInFacts('whatsapp', { address: 'someone@example.invalid' }).address).toBeNull()
    expect(signInFacts('email', { address: '+919000000000' }).address).toBeNull()
    expect(signInFacts('email', { address: '  ' }).address).toBeNull()
    // No person behind it: no consent is read, no withdraw link is made, no window is open.
    const facts = signInFacts('email', { address: 'someone@example.invalid' })
    expect(facts.personId).toBeNull()
    expect(facts.subscriberId).toBeNull()
    expect(facts.lastInboundAt).toBeNull()
  })
})

describe('H9 · the nightly O5', () => {
  it('removes what sign-in leaves behind, with the run’s own time', async () => {
    const now = new Date('2099-03-04T20:45:00.000Z')
    const req = { payload: { delete: async () => ({ docs: [] }) } } as never
    await runO5(req, now)
    expect(purgeSignIns).toHaveBeenCalledWith(req, now)
  })
})

describe('H5 · the account templates’ map', () => {
  it('is joined into the registry’s map, empty until the accounts’ builder A fills it', () => {
    for (const key of ['account-sign-in-code', 'account-closed', 'account-detail-added'] as const) {
      // A stub: the core answers `template-missing` and sends nothing until A lands.
      expect(IMPLEMENTATIONS[key]).toBeUndefined()
    }
  })
})
