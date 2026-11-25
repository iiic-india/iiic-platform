// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { IMPLEMENTATIONS } = await import('@/emails')
const { templateSpec, WHATSAPP_AUTHENTICATION_KEYS } = await import('@/emails/registry')
const { renderEmail } = await import('@/emails/render')
const { accountClosed, accountDetailAdded, accountSignInCode } =
  await import('@/emails/accounts/messages')
const { showsPrice, hasPlaceholder } = await import('@/lib/messaging/guards')

// A1 to A3 (docs/20 §9; D-123): in the registry with their rules, transactional, no offer, no
// price, no counselling content, A1's code in the body only and never sent from anything but the
// first try's `transient`. Fake addresses and codes only.

const CODE = '246810'
const context = {
  siteUrl: 'https://fake.example.invalid',
  assetUrl: 'https://fake.example.invalid/email',
  priceAllowed: false,
  footer: {
    legalLine: 'Fake legal line',
    siteUrl: 'https://fake.example.invalid',
    siteDisplay: 'fake.example.invalid',
  },
} as never

/** A request whose database answers what each load asks for. */
function fakeReq(rows: Record<string, Record<number, Record<string, unknown>>>) {
  return {
    payload: {
      findByID: async ({ collection, id }: { collection: string; id: number }) =>
        rows[collection]?.[id] ?? null,
    },
  } as never
}

/** A request whose database must not be touched. */
const untouchable = new Proxy(
  {},
  {
    get(_target, key) {
      throw new Error(`the template read req.${String(key)}`)
    },
  },
) as never

const COUNSELLING = /counsell|session notes|therap|crisis|Tele-MANAS|14416|scope/i

describe('the registry', () => {
  it('has A1 to A3 with their rules: transactional, hello@, no price, A1 with no withdraw link', () => {
    const code = templateSpec('account-sign-in-code')
    expect(code).toMatchObject({
      automations: ['A1'],
      kind: 'transactional',
      sender: 'hello',
      footer: 'none',
      price: 'never',
      builder: 'R2a',
    })
    expect(code.channels).toEqual(['email', 'whatsapp'])
    expect(WHATSAPP_AUTHENTICATION_KEYS).toContain('account-sign-in-code')
    for (const key of ['account-closed', 'account-detail-added'] as const) {
      expect(templateSpec(key)).toMatchObject({
        kind: 'transactional',
        sender: 'hello',
        footer: 'withdraw',
        price: 'never',
        channels: ['email'],
      })
    }
  })

  it('has the three implementations, A1 on WhatsApp too', () => {
    expect(IMPLEMENTATIONS['account-sign-in-code']?.email).toBeDefined()
    expect(IMPLEMENTATIONS['account-sign-in-code']?.whatsapp).toBeDefined()
    expect(IMPLEMENTATIONS['account-closed']?.email).toBeDefined()
    expect(IMPLEMENTATIONS['account-detail-added']?.email).toBeDefined()
  })
})

describe('A1 · the code', () => {
  const message = {
    subject: { collection: 'sign-in-requests', id: 41 },
    recipient: { kind: 'signIn', id: 41 },
  } as never

  it('answers stale without the first try’s transient, and reads nothing (never not-found, B4)', async () => {
    expect(await accountSignInCode.load(untouchable, message)).toEqual({
      ok: false,
      error: { code: 'stale' },
    })
    expect(
      await accountSignInCode.load(untouchable, {
        ...(message as object),
        transient: { code: CODE },
      } as never),
    ).toEqual({ ok: false, error: { code: 'stale' } })
  })

  it('takes the code from transient, and the purpose from its request row', async () => {
    const req = fakeReq({ 'sign-in-requests': { 41: { purpose: 'signIn' } } })
    expect(
      await accountSignInCode.load(req, {
        ...(message as object),
        transient: { code: CODE, address: 'someone@fake.example.invalid' },
      } as never),
    ).toEqual({ ok: true, value: { code: CODE, purpose: 'signIn' } })
  })

  it('puts the code in the body, never in the subject or the preheader a lock screen shows', async () => {
    const email = accountSignInCode.email
    if (!email) throw new Error('no A1 email')
    for (const purpose of ['signIn', 'addDetail'] as const) {
      const mail = await renderEmail(email, { code: CODE, purpose }, context)
      expect(mail.text).toContain(CODE)
      expect(mail.subject).not.toContain(CODE)
      expect(mail.preheader).not.toContain(CODE)
      expect(mail.text).toMatch(/10 minutes/)
      expect(mail.text).toMatch(/never asks for this code/)
      expect(mail.text).toMatch(/did not ask/)
      expect(showsPrice(mail.subject, mail.preheader, mail.text)).toBe(false)
      expect(hasPlaceholder(mail.subject, mail.text, mail.html)).toBe(false)
      expect(mail.text).not.toMatch(COUNSELLING)
      // No withdraw link: the address may have no record, and the code is about no consent.
      expect(mail.text).not.toContain('/w/')
    }
  })

  it('gives WhatsApp the code as the authentication template’s one variable', () => {
    expect(accountSignInCode.whatsapp?.params({ code: CODE, purpose: 'signIn' })).toEqual([CODE])
  })
})

describe('A2 · the account closed', () => {
  it('says what closed, what IIIC keeps and how to ask for erasure, with no price or offer', async () => {
    const req = fakeReq({ people: { 7: { fullName: 'Example Client' } } })
    const loaded = await accountClosed.load(req, {
      subject: { collection: 'accounts', id: 3 },
      recipient: { kind: 'person', id: 7 },
    } as never)
    expect(loaded).toEqual({ ok: true, value: { firstName: 'Example' } })
    const email = accountClosed.email
    if (!email || !loaded.ok) throw new Error('no A2')
    const mail = await renderEmail(email, loaded.value, context)
    expect(mail.text).toMatch(/Hello Example,/)
    expect(mail.text).toMatch(
      /keeps the records of your bookings, payments, invoices and certificates/,
    )
    expect(mail.text).toMatch(/erase the rest of your data/)
    expect(showsPrice(mail.subject, mail.preheader, mail.text)).toBe(false)
    expect(mail.text).not.toMatch(COUNSELLING)
    expect(mail.text).not.toMatch(/offer|discount|recommend/i)
  })
})

describe('A3 · a detail added', () => {
  it('names the kind of detail, masked, and whom to tell if it was not them', async () => {
    const req = fakeReq({
      people: {
        7: {
          fullName: 'Example Client',
          mobile: '+919000000000',
          mobileVerifiedAt: '2099-03-04T05:30:00.000Z',
        },
      },
      accounts: { 3: { person: 7 } },
    })
    const loaded = await accountDetailAdded.load(req, {
      subject: { collection: 'accounts', id: 3 },
      recipient: { kind: 'person', id: 7 },
    } as never)
    expect(loaded).toMatchObject({
      ok: true,
      value: { kind: 'mobile number', masked: '+91 ••••• •0000' },
    })
    const email = accountDetailAdded.email
    if (!email || !loaded.ok) throw new Error('no A3')
    const mail = await renderEmail(email, loaded.value, context)
    expect(mail.text).toContain('+91 ••••• •0000')
    expect(mail.text).not.toContain('9000000000')
    expect(mail.text).toMatch(/If you did not add it, reply to this email/)
    expect(showsPrice(mail.subject, mail.preheader, mail.text)).toBe(false)
    expect(mail.text).not.toMatch(COUNSELLING)
  })

  it('sends nothing for an account closed since', async () => {
    const req = fakeReq({ people: { 7: { fullName: 'Example Client' } }, accounts: {} })
    expect(
      await accountDetailAdded.load(req, {
        subject: { collection: 'accounts', id: 3 },
        recipient: { kind: 'person', id: 7 },
      } as never),
    ).toEqual({ ok: false, error: { code: 'stale' } })
  })
})
