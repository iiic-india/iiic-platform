import { sql } from '@payloadcms/db-postgres'
import { createLocalReq, type Payload, type Where } from 'payload'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// Sign-in against the real database and Better Auth on Payload's pool (docs/20 §4, §7.6, §11):
// the same answer whatever the address holds, the limits, Turnstile, the tries, a new code ending
// the old, a used code, the code in no row, job, log line or cookie; the account step's consent
// first, in one transaction, refused without the consent, for an address of a minor, or under a
// changed notice, and finished by the next code when it stopped part-way; sessions, and signing
// in again ending the session the browser carried; the owner's end-sessions; closing, which ends
// every session, frees every record and withdraws the account consent alone, and keeps the
// bookings, payments and invoices. Needs the r2a_accounts and r2a_customer_auth migrations.
// Obviously fake addresses, names, network addresses (TEST-NET-3), bookings and amounts, removed
// at the end (bar the consent texts in force and the audit entries); no staff user is made.

vi.mock('server-only', () => ({}))

// The request App Router code reads (src/lib/accounts/session.ts): each case below sets the
// headers its browser sends. Outside a request, `cookies()` answers as Next does there, which
// Better Auth's cookie plugin takes as "nothing to write" (better-auth/next-js); a redirect is
// thrown as an error that names where it goes.
const incoming = vi.hoisted(() => ({ headers: new Headers() }))
vi.mock('next/headers', () => ({
  headers: async () => incoming.headers,
  cookies: async () => {
    throw new Error('`cookies` was called outside a request scope.')
  },
}))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect to ${to}`)
  },
  notFound: () => {
    throw new Error('not found')
  },
}))

// Better Auth's secret for this file, before anything reads the environment; no fixed test code,
// so each code is read from the fake email it went in.
const SECRET = 'int-only-better-auth-secret-00000000000000000'
process.env.BETTER_AUTH_SECRET = SECRET
delete process.env.ACCOUNTS_TEST_CODE

const { getPayload } = await import('payload')
const { default: config } = await import('@/payload.config')
const { implementationOf } = await import('@/emails')
const { customerAuthFor } = await import('@/lib/accounts/auth/instance')
const {
  ADD_DETAIL_COOKIE,
  SIGN_IN,
  SIGN_IN_COOKIE,
  SIGN_IN_REQUEST_KEEP_HOURS,
  SESSION_COOKIE_PREFIX,
} = await import('@/lib/accounts/contract')
const details = await import('@/lib/accounts/details')
const { closeAccount, createAccountRecords, endAccountSessions } =
  await import('@/lib/accounts/lifecycle')
const { purgeSignIns } = await import('@/lib/accounts/purge')
const session = await import('@/lib/accounts/session')
const { identifierHash } = await import('@/lib/accounts/signIn/identifier')
const { openAttempt } = await import('@/lib/accounts/signIn/cookie')
const steps = await import('@/lib/accounts/signIn/steps')
const { submitterHash } = await import('@/lib/enquiryForms/guards')
const { fakeTurnstile } = await import('@/lib/enquiryForms/turnstile')
const { deliverWith } = await import('@/lib/messaging/deliver')
const { FakeEmailSender, FakeWhatsAppSender } = await import('@/lib/messaging/fakes')
const { consentFor, currentNotice } = await import('@/lib/privacy/consents')
const { NEWSLETTER_PERSON_NAME } = await import('@/lib/newsletter/subscriptions')

type AccountSession = import('@/lib/accounts/contract').AccountSession
type CookieJar = import('@/lib/accounts/signIn/cookie').CookieJar
type SignInWiring = import('@/lib/accounts/signIn/steps').SignInWiring
type TurnstileCheck = import('@/lib/enquiryForms/turnstile').TurnstileCheck

const TAG = 'int.accounts-sign-in'
const RUN = Date.now().toString(36)
const SITE = 'http://localhost:3000'
const NOTICE_TEXT = `Fake account notice for tests (${TAG}): keep my My IIIC account.`
const SERVICE_SLUG = 'int-accounts-sign-in'

let payload: Payload
let auth: NonNullable<ReturnType<typeof customerAuthFor>>
let flagsBefore: Record<string, unknown> = {}
let jobsBefore = 0
const used: string[] = []
/** The fake mobiles and Better Auth users a case made outside the code step, for the clean-up. */
const mobiles: string[] = []
const authUsers: string[] = []
const email = new FakeEmailSender()
const whatsapp = new FakeWhatsAppSender()

const settings = {
  VERCEL_ENV: undefined,
  BETTER_AUTH_SECRET: SECRET,
  siteUrl: SITE,
  MESSAGING_TRANSPORT: 'fake' as const,
  RESEND_API_KEY: undefined,
  WHATSAPP_API_KEY: undefined,
}

const deliver = deliverWith({
  channels: () => ({ email, whatsapp, configured: { email: true, whatsapp: false } }),
  now: () => new Date(),
  implementation: implementationOf,
  emit: async () => {},
  site: () => ({
    siteUrl: SITE,
    fromAddress: `${TAG}.from@fake.example.invalid`,
    blockPlaceholders: false,
  }),
})

/** A fresh fake address, kept for the clean-up. */
function address(name: string): string {
  const value = `${TAG}.${name}.${RUN}@fake.example.invalid`.toLowerCase()
  used.push(value)
  return value
}

/** The code the fake sender last carried to an address. */
function lastCode(to: string): string {
  const mail = [...email.sent].reverse().find((sent) => sent.to === to)
  const code = mail?.text.match(/\b(\d{6})\b/)?.[1]
  if (!code) throw new Error('no code was sent')
  return code
}

class Jar implements CookieJar {
  readonly values = new Map<string, string>()
  get = (name: string) => this.values.get(name)
  set = (name: string, value: string) => {
    this.values.set(name, value)
  }
  delete = (name: string) => {
    this.values.delete(name)
  }
}

let networks = 10
/** One browser: its own cookie jar and network address (TEST-NET-3). */
function browser(turnstile: TurnstileCheck | null = null) {
  networks += 1
  const jar = new Jar()
  const ip = `203.0.113.${networks}`
  const headers = new Headers({
    'x-forwarded-for': ip,
    'user-agent': 'Mozilla/5.0 (Fake test browser) Chrome/131.0 Safari/537.36',
  })
  const wiring: SignInWiring = {
    settings: () => settings,
    deps: async () => ({ env: settings, auth, headers, jar, turnstile, deliver }),
  }
  const req = () => createLocalReq({}, payload)
  return {
    jar,
    ip,
    headers,
    wiring,
    request: async (to: string, now = new Date(), extra: { turnstileToken?: string } = {}) =>
      steps.requestCodeWith(wiring)(
        await req(),
        { channel: 'email', identifier: to, ...extra },
        now,
      ),
    verify: async (code: string, trustDevice = false) =>
      steps.verifyCodeWith(wiring)(await req(), { code, trustDevice }, new Date()),
    create: async (input: { fullName: string; noticeVersionId: number; consent?: boolean }) =>
      steps.createAccountWith(wiring)(
        await req(),
        {
          fullName: input.fullName,
          consent: (input.consent ?? true) as true,
          adult: true,
          noticeVersionId: input.noticeVersionId,
          trustDevice: false,
        },
        new Date(),
      ),
  }
}

async function noticeId(): Promise<number> {
  const notice = await currentNotice(payload, 'account', 'en-IN')
  if (!notice) throw new Error('no account notice')
  return notice.id
}

async function rowsFor(to: string) {
  const { docs } = await payload.find({
    collection: 'sign-in-requests',
    where: { identifierHash: { equals: identifierHash(SECRET, 'email', to) } },
    pagination: false,
    depth: 0,
  })
  return docs
}

async function accountOf(to: string) {
  const { docs } = await payload.find({
    collection: 'people',
    where: { and: [{ email: { equals: to } }, { emailVerifiedAt: { exists: true } }] },
    limit: 1,
    depth: 0,
  })
  const accountId = docs[0]?.account
  if (!accountId) return null
  return payload.findByID({
    collection: 'accounts',
    id: typeof accountId === 'object' ? accountId.id : accountId,
    depth: 0,
  })
}

/** Signs a new address in end to end: code, account step; returns the account. */
async function newAccount(name: string) {
  const to = address(name)
  const person = browser()
  expect((await person.request(to)).ok).toBe(true)
  const checked = await person.verify(lastCode(to))
  expect(checked).toMatchObject({ ok: true, value: { state: 'needs-account' } })
  const made = await person.create({
    fullName: `Fake ${TAG} ${name}`,
    noticeVersionId: await noticeId(),
  })
  if (!made.ok) throw new Error(`no account: ${made.error.code}`)
  return { to, accountId: made.value.accountId, person }
}

async function removeTestData() {
  const context = await auth.$context
  for (const to of used) {
    const user = await context.internalAdapter.findUserByEmail(to)
    if (user) await context.internalAdapter.deleteUser(user.user.id)
  }
  for (const id of authUsers) {
    if (await context.internalAdapter.findUserById(id)) await context.internalAdapter.deleteUser(id)
  }
  const ours: Where = { or: [{ email: { in: used } }, { mobile: { in: mobiles } }] }
  const hashes = used.map((to) => identifierHash(SECRET, 'email', to))
  const { docs: requests } = await payload.find({
    collection: 'sign-in-requests',
    where: { identifierHash: { in: hashes } },
    pagination: false,
    depth: 0,
  })
  const requestIds = requests.map((row) => row.id)
  if (requestIds.length) {
    await payload.delete({
      collection: 'messages',
      where: {
        and: [
          { subjectCollection: { equals: 'sign-in-requests' } },
          { subjectId: { in: requestIds } },
        ],
      },
    })
    await payload.delete({ collection: 'sign-in-requests', where: { id: { in: requestIds } } })
  }
  const { docs: people } = await payload.find({
    collection: 'people',
    where: ours,
    pagination: false,
    depth: 0,
  })
  // The closing case's booking, its payment and its invoice, then what it was booked with.
  const personIds = people.map((person) => person.id)
  if (personIds.length) {
    const { docs: bookings } = await payload.find({
      collection: 'bookings',
      where: { person: { in: personIds } },
      pagination: false,
      depth: 0,
    })
    const bookingIds = bookings.map((booking) => booking.id)
    if (bookingIds.length) {
      await payload.delete({ collection: 'invoices', where: { booking: { in: bookingIds } } })
      await payload.delete({ collection: 'payments', where: { booking: { in: bookingIds } } })
      await payload.delete({ collection: 'bookings', where: { id: { in: bookingIds } } })
    }
  }
  await payload.delete({ collection: 'practitioners', where: { publicName: { like: TAG } } })
  await payload.delete({ collection: 'services', where: { slug: { like: SERVICE_SLUG } } })
  const accountIds = [
    ...new Set(
      people
        .map((person) => (typeof person.account === 'object' ? person.account?.id : person.account))
        .filter((id): id is number => typeof id === 'number'),
    ),
  ]
  if (accountIds.length) {
    await payload.delete({ collection: 'accounts', where: { id: { in: accountIds } } })
  }
  await payload.delete({
    collection: 'messages',
    where: {
      and: [{ subjectCollection: { equals: 'accounts' } }, { automation: { in: ['A2', 'A3'] } }],
    },
  })
  await payload.delete({ collection: 'suppressions', where: { address: { in: used } } })
  await payload.delete({ collection: 'people', where: ours })
  // Whatever this file's writes queued (a withdrawal's V2 and N3, a suppression's O9).
  await payload.db.drizzle.execute(sql`DELETE FROM "payload_jobs" WHERE "id" > ${jobsBefore}`)
}

beforeAll(async () => {
  payload = await getPayload({ config })
  const made = customerAuthFor(payload)
  if (!made) throw new Error('Better Auth is not set up for the test')
  auth = made
  const settingsRow = await payload.findGlobal({ slug: 'settings', depth: 0 })
  flagsBefore = { ...(settingsRow.flags ?? {}) }
  await payload.updateGlobal({
    slug: 'settings',
    data: { flags: { ...(settingsRow.flags ?? {}), accountsEnabled: true } },
  })
  if (!(await currentNotice(payload, 'account', 'en-IN'))) {
    await payload.create({
      collection: 'consent-versions',
      data: {
        purpose: 'account',
        language: 'en-IN',
        text: NOTICE_TEXT,
        effectiveFrom: new Date(Date.now() - 86_400_000).toISOString(),
        effectiveFrom_tz: 'Asia/Kolkata',
      } as never,
      overrideAccess: true,
    })
  }
  const result = await payload.db.drizzle.execute(
    sql`SELECT COALESCE(MAX("id"), 0) AS "max" FROM "payload_jobs"`,
  )
  jobsBefore = Number((result as unknown as { rows: { max: number }[] }).rows[0]?.max ?? 0)
})

afterAll(async () => {
  await removeTestData()
  await payload.updateGlobal({ slug: 'settings', data: { flags: flagsBefore as never } })
})

describe('asking for a code (docs/20 §4.4, §4.8)', () => {
  it('answers the same for an address with an account, without one, suppressed, and typed oddly', async () => {
    const { to: holder } = await newAccount('holder')
    const fresh = address('fresh')
    const suppressed = address('suppressed')
    await payload.create({
      collection: 'suppressions',
      data: { channel: 'email', address: suppressed, reason: 'manual' } as never,
      overrideAccess: true,
    })
    const odd = address('odd')
    const answers = []
    for (const [to, typed] of [
      [holder, holder],
      [fresh, fresh],
      [suppressed, suppressed],
      [odd, `  ${odd.toUpperCase()}  `],
    ] as const) {
      const before = (await rowsFor(to)).length
      const answer = await browser().request(typed, new Date(Date.now() + 2 * 60_000))
      expect(answer.ok).toBe(true)
      if (answer.ok) answers.push(Object.keys(answer.value).sort().join(','))
      // The row is written in every case.
      expect((await rowsFor(to)).length).toBe(before + 1)
    }
    expect(new Set(answers).size).toBe(1)
    // The suppressed address is sent nothing; the answer did not say so.
    expect(email.sent.some((sent) => sent.to === suppressed)).toBe(false)
  })

  it('refuses a second code within a minute, says when, and writes nothing for it', async () => {
    const to = address('twice')
    const person = browser()
    const now = new Date()
    expect((await person.request(to, now)).ok).toBe(true)
    const again = await person.request(to, new Date(now.getTime() + 20_000))
    expect(again).toMatchObject({ ok: false, error: { code: 'too-many' } })
    if (!again.ok && again.error.code === 'too-many') {
      expect(again.error.retryAt.getTime()).toBe(now.getTime() + 60_000)
    }
    expect(await rowsFor(to)).toHaveLength(1)
  })

  it('refuses the twenty-first code from one network address in an hour', async () => {
    const person = browser()
    const now = new Date()
    for (let i = 0; i < 20; i += 1) {
      await payload.create({
        collection: 'sign-in-requests',
        data: {
          purpose: 'signIn',
          channel: 'email',
          identifierHash: `int-${RUN}-${i}`.padEnd(64, '0'),
          networkHash: submitterHash(SECRET, person.ip, now),
          requestedAt: new Date(now.getTime() - (i + 1) * 60_000).toISOString(),
        },
        overrideAccess: true,
      })
    }
    const to = address('network')
    expect(await person.request(to, now)).toMatchObject({ ok: false, error: { code: 'too-many' } })
    expect(await rowsFor(to)).toHaveLength(0)
    // The same address from another network is not this network's limit.
    expect((await browser().request(to, now)).ok).toBe(true)
    await payload.delete({
      collection: 'sign-in-requests',
      where: { identifierHash: { like: `int-${RUN}-` } },
    })
  })

  it('stores nothing when Turnstile’s check fails', async () => {
    const to = address('turnstile')
    const check = fakeTurnstile(['pass'])
    const failed = await browser(check).request(to, new Date(), { turnstileToken: 'fail' })
    expect(failed).toEqual({ ok: false, error: { code: 'check-failed' } })
    expect(await rowsFor(to)).toHaveLength(0)
    expect((await browser(check).request(to, new Date(), { turnstileToken: 'pass' })).ok).toBe(true)
  })

  it('keeps the code out of every row, job, log line and cookie', async () => {
    const logged: string[] = []
    const spies = (['info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(payload.logger, level).mockImplementation(((...args: unknown[]) => {
        logged.push(JSON.stringify(args))
      }) as never),
    )
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      logged.push(JSON.stringify(args))
    })
    try {
      const to = address('nowhere')
      const person = browser()
      expect((await person.request(to)).ok).toBe(true)
      const code = lastCode(to)
      const [row] = await rowsFor(to)
      const { docs: messages } = await payload.find({
        collection: 'messages',
        where: {
          and: [
            { subjectCollection: { equals: 'sign-in-requests' } },
            { subjectId: { equals: row?.id } },
          ],
        },
        depth: 0,
      })
      expect(messages).toHaveLength(1)
      const jobs = await payload.db.drizzle.execute(
        sql`SELECT "input"::text AS "input" FROM "payload_jobs" WHERE "id" > ${jobsBefore}`,
      )
      const stored = JSON.stringify([row, messages, (jobs as unknown as { rows: unknown[] }).rows])
      expect(stored).not.toContain(code)
      expect(stored).not.toContain(to)
      const cookie = person.jar.get('iiic-sign-in') ?? ''
      expect(cookie).not.toContain(code)
      const opened = await openAttempt(SECRET, cookie, new Date())
      expect(JSON.stringify(opened)).not.toContain(code)
      expect(logged.join('\n')).not.toContain(code)
      expect(logged.join('\n')).not.toContain(to)
    } finally {
      for (const spy of spies) spy.mockRestore()
      consoleSpy.mockRestore()
    }
  })
})

describe('entering the code (docs/20 §4.2)', () => {
  it('says how many tries are left, and the fifth wrong one ends the code', async () => {
    const to = address('tries')
    const person = browser()
    await person.request(to)
    const code = lastCode(to)
    const wrong = code === '000000' ? '111111' : '000000'
    for (let left = SIGN_IN.attemptsPerCode - 1; left > 0; left -= 1) {
      expect(await person.verify(wrong)).toEqual({
        ok: false,
        error: { code: 'wrong-code', triesLeft: left },
      })
    }
    expect(await person.verify(wrong)).toEqual({ ok: false, error: { code: 'too-many-tries' } })
    // Even the right code no longer works.
    expect((await person.verify(code)).ok).toBe(false)
  })

  it('ends the old code when a new one is asked for', async () => {
    const to = address('rotate')
    const person = browser()
    const now = new Date()
    await person.request(to, now)
    const first = lastCode(to)
    await person.request(to, new Date(now.getTime() + 61_000))
    const second = lastCode(to)
    if (first !== second) {
      expect((await person.verify(first)).ok).toBe(false)
    }
    expect(await person.verify(second)).toMatchObject({
      ok: true,
      value: { state: 'needs-account' },
    })
  })

  it('takes a code once: a used code cannot sign in again', async () => {
    const { to } = await newAccount('once')
    const person = browser()
    await person.request(to, new Date(Date.now() + 5 * 60_000))
    const code = lastCode(to)
    const sealed = person.jar.get('iiic-sign-in') as string
    expect(await person.verify(code)).toMatchObject({ ok: true, value: { state: 'signed-in' } })
    // The same attempt replayed with its code.
    person.jar.set('iiic-sign-in', sealed)
    expect(await person.verify(code)).toEqual({ ok: false, error: { code: 'expired' } })
  })

  it('answers no-request in a browser that asked for no code', async () => {
    expect(await browser().verify('123456')).toEqual({ ok: false, error: { code: 'no-request' } })
  })
})

describe('a new account (docs/20 §4.5; D-113, D-114)', () => {
  it('stores nothing without the consent', async () => {
    const to = address('no-consent')
    const person = browser()
    await person.request(to)
    await person.verify(lastCode(to))
    const refused = await person.create({
      fullName: `Fake ${TAG} no consent`,
      noticeVersionId: await noticeId(),
      consent: false,
    })
    expect(refused).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
    const { totalDocs } = await payload.count({
      collection: 'people',
      where: { email: { equals: to } },
    })
    expect(totalDocs).toBe(0)
  })

  it('keeps no person, account or Better Auth user when the consent cannot be written (CLAUDE.md #4)', async () => {
    const to = address('consent-fails')
    const person = browser()
    await person.request(to)
    await person.verify(lastCode(to))
    const create = payload.create.bind(payload)
    const refuse = vi.spyOn(payload, 'create').mockImplementation((async (
      options: Parameters<typeof payload.create>[0],
    ) => {
      if (options.collection === 'consents') throw new Error('the consent could not be written')
      return create(options)
    }) as typeof payload.create)
    try {
      await expect(
        person.create({ fullName: `Fake ${TAG} consent fails`, noticeVersionId: await noticeId() }),
      ).rejects.toThrow(/consent could not be written/)
    } finally {
      refuse.mockRestore()
    }
    const { totalDocs } = await payload.count({
      collection: 'people',
      where: { email: { equals: to } },
    })
    expect(totalDocs).toBe(0)
    expect(await accountOf(to)).toBeNull()
    expect(await (await auth.$context).internalAdapter.findUserByEmail(to)).toBeNull()
  })

  it('records the consent under the notice in force, then the record, the account, the user and a session', async () => {
    const { to, accountId } = await newAccount('made')
    const account = await payload.findByID({ collection: 'accounts', id: accountId, depth: 0 })
    expect(account.authUserId).toBeTruthy()
    expect(account.lastSignInChannel).toBe('email')
    const personId = typeof account.person === 'object' ? account.person.id : account.person
    const record = await payload.findByID({ collection: 'people', id: personId, depth: 0 })
    expect(record.email).toBe(to)
    expect(record.emailVerifiedAt).toBeTruthy()
    expect(record.ageBand).toBe('adult')
    const { docs: consents } = await payload.find({
      collection: 'consents',
      where: { and: [{ person: { equals: personId } }, { purpose: { equals: 'account' } }] },
      depth: 0,
    })
    expect(consents).toHaveLength(1)
    expect(consents[0]?.noticeVersion).toBe(await noticeId())
    expect(consents[0]?.channel).toBe('web')
    expect(consents[0]?.evidence?.form).toBe('/login/verify')
    // The consent came first: given no later than the account was made.
    expect(new Date(consents[0]?.grantedAt ?? 0).getTime()).toBeLessThanOrEqual(
      new Date(account.createdAt).getTime(),
    )
    const sessions = await (
      await auth.$context
    ).internalAdapter.listSessions(account.authUserId as string)
    expect(sessions).toHaveLength(1)
    const { totalDocs: audited } = await payload.count({
      collection: 'audit-log',
      where: {
        and: [
          { action: { equals: 'create-account' } },
          { entityId: { equals: String(accountId) } },
          { actorId: { equals: `account:${accountId}` } },
        ],
      },
    })
    expect(audited).toBe(1)
  })

  it('takes a record the newsletter made as its own, never offers its placeholder, and names it as typed (D-131)', async () => {
    const to = address('journal')
    // As confirming the Journal makes it for an address no record holds.
    const journal = await payload.create({
      collection: 'people',
      data: {
        fullName: NEWSLETTER_PERSON_NAME,
        email: to,
        emailVerifiedAt: new Date(Date.now() - 86_400_000).toISOString(),
        language: 'en-IN',
        source: 'newsletter',
      } as never,
      overrideAccess: true,
    })
    const person = browser()
    await person.request(to)
    expect(await person.verify(lastCode(to))).toEqual({
      ok: true,
      value: { state: 'needs-account', suggestedName: null },
    })
    const typed = `Fake ${TAG} journal reader`
    const made = await person.create({ fullName: typed, noticeVersionId: await noticeId() })
    expect(made).toMatchObject({ ok: true })
    const account = await accountOf(to)
    expect(account?.person).toBe(journal.id)
    const record = await payload.findByID({ collection: 'people', id: journal.id, depth: 0 })
    expect(record.fullName).toBe(typed)
    const { totalDocs } = await payload.count({
      collection: 'people',
      where: { email: { equals: to } },
    })
    expect(totalDocs).toBe(1)
  })

  it('refuses an address an earlier record says belongs to someone under 18', async () => {
    const to = address('minor')
    await payload.create({
      collection: 'people',
      data: { fullName: `Fake ${TAG} minor`, email: to, ageBand: 'under18' } as never,
      overrideAccess: true,
    })
    const person = browser()
    await person.request(to)
    await person.verify(lastCode(to))
    expect(
      await person.create({ fullName: `Fake ${TAG} minor`, noticeVersionId: await noticeId() }),
    ).toEqual({ ok: false, error: { code: 'not-for-under-18' } })
    expect(await accountOf(to)).toBeNull()
  })

  it('draws the step again when the notice shown is no longer the one in force', async () => {
    const to = address('notice')
    const person = browser()
    await person.request(to)
    await person.verify(lastCode(to))
    expect(
      await person.create({
        fullName: `Fake ${TAG} notice`,
        noticeVersionId: (await noticeId()) + 100_000,
      }),
    ).toEqual({ ok: false, error: { code: 'notice-changed' } })
    expect(await accountOf(to)).toBeNull()
  })

  it('is finished by the next right code when it stopped before Better Auth’s user', async () => {
    const to = address('unfinished')
    const { accountId } = await createAccountRecords(await createLocalReq({}, payload), {
      channel: 'email',
      value: to,
      fullName: `Fake ${TAG} unfinished`,
      noticeVersionId: await noticeId(),
      evidence: { ip: null, userAgent: null },
      now: new Date(),
    })
    expect(
      (await payload.findByID({ collection: 'accounts', id: accountId, depth: 0 })).authUserId,
    ).toBeFalsy()
    const person = browser()
    await person.request(to)
    expect(await person.verify(lastCode(to))).toMatchObject({
      ok: true,
      value: { state: 'signed-in', accountId },
    })
    expect(
      (await payload.findByID({ collection: 'accounts', id: accountId, depth: 0 })).authUserId,
    ).toBeTruthy()
  })
})

describe('sessions (docs/20 §4.7; D-115, D-125)', () => {
  it('last thirty days on a kept device and a day otherwise, never sliding', async () => {
    const { accountId } = await newAccount('lengths')
    const account = await payload.findByID({ collection: 'accounts', id: accountId, depth: 0 })
    const userId = account.authUserId as string
    for (const [trusted, hours] of [
      [true, SIGN_IN.trustedSessionDays * 24],
      [false, SIGN_IN.untrustedSessionHours],
    ] as const) {
      const { headers, response } = await auth.api.startSession({
        body: { userId, trusted },
        returnHeaders: true,
      })
      const length = new Date(response.expiresAt).getTime() - new Date(response.createdAt).getTime()
      expect(Math.round(length / 3_600_000)).toBe(hours)
      const cookie = headers
        .getSetCookie()
        .map((line) => line.split(';')[0])
        .join('; ')
      expect(cookie).toContain(`${SESSION_COOKIE_PREFIX}.session_token=`)
      const read = await auth.api.getSession({
        headers: new Headers({ cookie }),
        returnHeaders: true,
      })
      expect(read.response?.session.expiresAt).toEqual(new Date(response.expiresAt))
      expect(read.headers?.getSetCookie?.() ?? []).toEqual([])
    }
  })

  it('end the one this browser carried when the person signs in again, and only that one (D-130)', async () => {
    const { to, accountId, person } = await newAccount('again')
    const userId = (await payload.findByID({ collection: 'accounts', id: accountId, depth: 0 }))
      .authUserId as string
    const context = await auth.$context
    // The account step's session: another device's, as far as this test is concerned.
    const [elsewhere] = await context.internalAdapter.listSessions(userId)
    expect(elsewhere).toBeDefined()
    // The session this browser holds, its cookie sent with every request it makes.
    const { headers: started, response: carried } = await auth.api.startSession({
      body: { userId, trusted: true },
      returnHeaders: true,
    })
    const cookie = started
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .join('; ')
    person.headers.set('cookie', cookie)
    // "Sign in again" (D-121): a new code to the same address, then the code.
    await person.request(to, new Date(Date.now() + 5 * 60_000))
    expect(await person.verify(lastCode(to))).toMatchObject({
      ok: true,
      value: { state: 'signed-in', accountId },
    })
    const ids = (await context.internalAdapter.listSessions(userId)).map((session) => session.id)
    expect(ids).toHaveLength(2)
    expect(ids).toContain(elsewhere?.id)
    expect(ids).not.toContain(carried.sessionId)
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull()
  })

  it('end at an owner’s word, only with the owner role and the two-factor code', async () => {
    const { accountId } = await newAccount('ended')
    const userId = (await payload.findByID({ collection: 'accounts', id: accountId, depth: 0 }))
      .authUserId as string
    const staff = (roles: string[], strategy: string) =>
      createLocalReq(
        {
          user: {
            id: 999_001,
            collection: 'users',
            roles,
            active: true,
            _strategy: strategy,
          } as never,
        },
        payload,
      )
    expect(await endAccountSessions(await staff(['owner'], 'local-jwt'), accountId)).toEqual({
      ok: false,
      error: { code: 'refused' },
    })
    expect(await endAccountSessions(await staff(['operator'], 'totp'), accountId)).toEqual({
      ok: false,
      error: { code: 'refused' },
    })
    const ended = await endAccountSessions(await staff(['owner'], 'totp'), accountId)
    expect(ended).toEqual({ ok: true, value: { ended: 1 } })
    expect(await (await auth.$context).internalAdapter.listSessions(userId)).toHaveLength(0)
  })
})

describe('the session in App Router code (docs/20 §3.5, §4.7, §11)', () => {
  const BROWSER = 'Mozilla/5.0 (Fake test browser) Chrome/131.0 Safari/537.36'

  /** This browser's own session for the user: the cookie its requests now carry. */
  async function thisBrowser(userId: string) {
    const { headers: started, response } = await auth.api.startSession({
      body: { userId, trusted: true },
      returnHeaders: true,
    })
    const cookie = started
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .join('; ')
    incoming.headers = new Headers({
      cookie,
      'user-agent': BROWSER,
      'x-forwarded-for': '203.0.113.240',
    })
    return { cookie, sessionId: response.sessionId }
  }

  async function userOf(accountId: number) {
    const account = await payload.findByID({ collection: 'accounts', id: accountId, depth: 0 })
    const personId = typeof account.person === 'object' ? account.person.id : account.person
    return { userId: account.authUserId as string, personId }
  }

  afterEach(() => {
    incoming.headers = new Headers()
  })

  it('reads the account a request’s cookie belongs to, and sends a request without one to sign in', async () => {
    const { to, accountId } = await newAccount('app-session')
    const { userId, personId } = await userOf(accountId)
    const { sessionId } = await thisBrowser(userId)
    expect(await session.getAccountSession()).toMatchObject({
      accountId,
      personId,
      authUserId: userId,
      sessionId,
      trustedDevice: true,
      verified: { email: to, mobile: null },
    })
    expect(
      await session.requireAccount({ next: '/account/privacy', recentMinutes: 10 }),
    ).toMatchObject({ accountId, sessionId })
    // No cookie: no session, and the door sends the person to sign in, keeping where they were.
    incoming.headers = new Headers({ 'user-agent': BROWSER })
    expect(await session.getAccountSession()).toBeNull()
    await expect(session.requireAccount({ next: '/account/privacy' })).rejects.toThrow(
      'redirect to /login?next=%2Faccount%2Fprivacy',
    )
  })

  it('lists every device of the account, marks this one, and "Sign out everywhere" leaves only it, audited', async () => {
    const { accountId } = await newAccount('everywhere')
    const { userId } = await userOf(accountId)
    // The account step's session, and one more device, besides this browser's.
    await auth.api.startSession({ body: { userId, trusted: false } })
    const { sessionId } = await thisBrowser(userId)
    const me = await session.getAccountSession()
    if (!me) throw new Error('no session read')
    const devices = await session.listDevices(me)
    expect(devices).toHaveLength(3)
    expect(devices.filter((device) => device.current).map((device) => device.id)).toEqual([
      sessionId,
    ])
    const times = devices.map((device) => device.signedInAt.getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))

    const req = await createLocalReq(
      {
        req: {
          headers: new Headers({ 'user-agent': BROWSER, 'x-forwarded-for': '203.0.113.240' }),
        },
        context: { auditActor: { id: `account:${accountId}` } },
      },
      payload,
    )
    expect(await session.signOutEverywhere(req, me)).toBe(2)
    const context = await auth.$context
    expect((await context.internalAdapter.listSessions(userId)).map((row) => row.id)).toEqual([
      sessionId,
    ])
    // This browser stays signed in.
    expect(await session.getAccountSession()).toMatchObject({ accountId, sessionId })
    const { docs: entries } = await payload.find({
      collection: 'audit-log',
      where: {
        and: [
          { action: { equals: 'sign-out-everywhere' } },
          { entityId: { equals: String(accountId) } },
        ],
      },
      depth: 0,
      overrideAccess: true,
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ actorId: `account:${accountId}`, changed: 'sessions:2' })
  })

  it('signs this browser out and leaves the person’s other devices signed in', async () => {
    const { accountId } = await newAccount('sign-out')
    const { userId } = await userOf(accountId)
    const context = await auth.$context
    const [elsewhere] = await context.internalAdapter.listSessions(userId)
    expect(elsewhere).toBeDefined()
    const { cookie } = await thisBrowser(userId)
    await session.signOut()
    expect((await context.internalAdapter.listSessions(userId)).map((row) => row.id)).toEqual([
      elsewhere?.id,
    ])
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull()
    expect(await session.getAccountSession()).toBeNull()
  })
})

describe('a second detail (docs/20 §4.6; D-120, D-128, D-129)', () => {
  it('proves an email for a WhatsApp account with a real code, gives it to Better Auth’s user and attaches the records holding it', async () => {
    const to = address('second-detail')
    const mobile = `+9199${Date.now().toString().slice(-8)}`
    mobiles.push(mobile)
    // A WhatsApp account, as the account step leaves it once its code proved the mobile.
    const { accountId, personId } = await createAccountRecords(await createLocalReq({}, payload), {
      channel: 'whatsapp',
      value: mobile,
      fullName: `Fake ${TAG} second detail`,
      noticeVersionId: await noticeId(),
      evidence: { ip: null, userAgent: null },
      now: new Date(),
    })
    const made = await auth.api.createCustomer({ body: { channel: 'whatsapp', value: mobile } })
    authUsers.push(made.userId)
    await payload.update({
      collection: 'accounts',
      id: accountId,
      data: { authUserId: made.userId },
      overrideAccess: true,
    })
    // An earlier booking's record that holds the email, not yet proven anywhere.
    const earlier = await payload.create({
      collection: 'people',
      data: { fullName: `Fake ${TAG} second detail earlier`, email: to } as never,
      overrideAccess: true,
    })
    const account: AccountSession = {
      accountId,
      personId,
      authUserId: made.userId,
      sessionId: `fake-session-${RUN}`,
      signedInAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
      trustedDevice: false,
      verified: { email: null, mobile },
    }
    const person = browser()
    // As accountRequest builds it on the privacy page's contact step.
    const req = () =>
      createLocalReq({ context: { auditActor: { id: `account:${accountId}` } } }, payload)

    expect(
      await details.requestDetailCodeWith(person.wiring)(
        await req(),
        account,
        { channel: 'email', identifier: to },
        new Date(),
      ),
    ).toMatchObject({ ok: true })
    // The attempt has its own cookie, never the sign-in's (D-129).
    expect(person.jar.get(ADD_DETAIL_COOKIE.name)).toBeTruthy()
    expect(person.jar.get(SIGN_IN_COOKIE.name)).toBeUndefined()
    const code = lastCode(to)
    const wrong = code === '000000' ? '111111' : '000000'
    expect(
      await details.confirmDetailWith(person.wiring)(
        await req(),
        account,
        { code: wrong },
        new Date(),
      ),
    ).toEqual({ ok: false, error: { code: 'wrong-code', triesLeft: SIGN_IN.attemptsPerCode - 1 } })
    expect(
      await details.confirmDetailWith(person.wiring)(await req(), account, { code }, new Date()),
    ).toEqual({ ok: true, value: { attached: 1 } })
    expect(person.jar.get(ADD_DETAIL_COOKIE.name)).toBeUndefined()

    // Proven on the own record, given to Better Auth's user, and the earlier record attached.
    const own = await payload.findByID({ collection: 'people', id: personId, depth: 0 })
    expect(own).toMatchObject({ email: to, mobile })
    expect(own.emailVerifiedAt).toBeTruthy()
    expect(own.mobileVerifiedAt).toBeTruthy()
    const user = await (await auth.$context).internalAdapter.findUserById(made.userId)
    expect(user).toMatchObject({ email: to, emailVerified: true })
    const attached = await payload.findByID({ collection: 'people', id: earlier.id, depth: 0 })
    expect(attached.account).toBe(accountId)
    const { docs: entries } = await payload.find({
      collection: 'audit-log',
      where: {
        and: [
          { action: { equals: 'add-contact-detail' } },
          { entityId: { equals: String(accountId) } },
        ],
      },
      depth: 0,
      overrideAccess: true,
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ actorId: `account:${accountId}`, changed: 'email' })
    // The same code cannot prove it twice.
    expect(
      await details.confirmDetailWith(person.wiring)(await req(), account, { code }, new Date()),
    ).toEqual({ ok: false, error: { code: 'no-request' } })
  })
})

describe('the nightly purge (docs/20 §4.8; D-116; O5, H9)', () => {
  it('removes sign-in rows older than the hours kept and Better Auth’s ended sessions and codes, and keeps the rest', async () => {
    const now = new Date()
    const hours = (count: number) => new Date(now.getTime() - count * 3_600_000).toISOString()
    const to = address('purge')
    const row = (requestedAt: string) =>
      payload.create({
        collection: 'sign-in-requests',
        data: {
          purpose: 'signIn',
          channel: 'email',
          identifierHash: identifierHash(SECRET, 'email', to),
          networkHash: identifierHash(SECRET, 'email', `network.${to}`),
          requestedAt,
        },
        overrideAccess: true,
      })
    const old = await row(hours(SIGN_IN_REQUEST_KEEP_HOURS + 1))
    const kept = await row(hours(SIGN_IN_REQUEST_KEEP_HOURS - 1))

    const { accountId } = await newAccount('purge-sessions')
    const userId = (await payload.findByID({ collection: 'accounts', id: accountId, depth: 0 }))
      .authUserId as string
    const context = await auth.$context
    // Better Auth sets a session's end itself unless told to take the one given (overrideAll).
    const ended = await context.internalAdapter.createSession(
      userId,
      false,
      { expiresAt: new Date(now.getTime() - 60_000) },
      true,
    )
    const live = await context.internalAdapter.createSession(userId, false)
    const endedCode = await context.internalAdapter.createVerificationValue({
      identifier: `${TAG}.purge-ended.${RUN}`,
      value: 'fake-ended-code',
      expiresAt: new Date(now.getTime() - 60_000),
    })
    const liveCode = await context.internalAdapter.createVerificationValue({
      identifier: `${TAG}.purge-live.${RUN}`,
      value: 'fake-live-code',
      expiresAt: new Date(now.getTime() + 10 * 60_000),
    })
    const present = async (model: 'session' | 'verification', id: string) =>
      (await context.adapter.findOne({ model, where: [{ field: 'id', value: id }] })) !== null

    try {
      const result = await purgeSignIns(await createLocalReq({}, payload), now)
      expect(result.requests).toBeGreaterThanOrEqual(1)
      expect(result.sessions).toBeGreaterThanOrEqual(1)
      expect(result.codes).toBeGreaterThanOrEqual(1)
      const left = await payload.find({
        collection: 'sign-in-requests',
        where: { id: { in: [old.id, kept.id] } },
        depth: 0,
      })
      expect(left.docs.map((doc) => doc.id)).toEqual([kept.id])
      expect(await present('session', ended.id)).toBe(false)
      expect(await present('session', live.id)).toBe(true)
      expect(await present('verification', endedCode.id)).toBe(false)
      expect(await present('verification', liveCode.id)).toBe(true)
      // One entry for the run, with the counts, no actor and no one's details.
      const { docs: entries } = await payload.find({
        collection: 'audit-log',
        where: {
          and: [
            { action: { equals: 'purge-expired' } },
            { at: { greater_than_equal: now.toISOString() } },
          ],
        },
        depth: 0,
        overrideAccess: true,
      })
      expect(entries.length).toBeGreaterThanOrEqual(1)
      for (const entry of entries) {
        expect(entry.actorId ?? null).toBeNull()
        expect(entry.actorEmail ?? null).toBeNull()
        expect(entry.changed).toMatch(/^requests:\d+, sessions:\d+, codes:\d+$/)
      }
    } finally {
      await context.adapter.delete({
        model: 'verification',
        where: [{ field: 'id', value: liveCode.id }],
      })
    }
  })
})

describe('closing an account (docs/20 §7.6)', () => {
  it('removes the user, its sessions and links and the account, withdraws the consent, keeps the record and tells the person', async () => {
    const { to, accountId } = await newAccount('closed')
    const account = await payload.findByID({ collection: 'accounts', id: accountId, depth: 0 })
    const userId = account.authUserId as string
    const personId = typeof account.person === 'object' ? account.person.id : account.person
    expect(
      await closeAccount(await createLocalReq({}, payload), { accountId, reason: 'person' }),
    ).toEqual({
      ok: true,
      value: { closed: true },
    })
    const context = await auth.$context
    expect(await context.internalAdapter.findUserById(userId)).toBeNull()
    expect(await context.internalAdapter.listSessions(userId)).toHaveLength(0)
    expect(
      await payload.findByID({
        collection: 'accounts',
        id: accountId,
        depth: 0,
        disableErrors: true,
      }),
    ).toBeNull()
    const record = await payload.findByID({ collection: 'people', id: personId, depth: 0 })
    expect(record.account ?? null).toBeNull()
    expect(record.emailVerifiedAt).toBeTruthy()
    const { docs: withdrawals } = await payload.find({
      collection: 'consents',
      where: {
        and: [
          { person: { equals: personId } },
          { purpose: { equals: 'account' } },
          { withdraws: { exists: true } },
        ],
      },
      depth: 0,
    })
    expect(withdrawals).toHaveLength(1)
    const { totalDocs: told } = await payload.count({
      collection: 'messages',
      where: {
        and: [
          { automation: { equals: 'A2' } },
          { subjectCollection: { equals: 'accounts' } },
          { subjectId: { equals: accountId } },
        ],
      },
    })
    expect(told).toBe(1)
    // Its proven email was the account's own: A2 goes there, through the core's own senders.
    expect(record.email).toBe(to)
  })

  it('keeps the bookings, payments, invoices and other consents, frees every record, ends every session and is audited in the account’s name', async () => {
    const { to, accountId } = await newAccount('closed-whole')
    const account = await payload.findByID({ collection: 'accounts', id: accountId, depth: 0 })
    const userId = account.authUserId as string
    const personId = typeof account.person === 'object' ? account.person.id : account.person
    // An earlier record of the same person, attached to the account (docs/03 F7).
    const earlier = await payload.create({
      collection: 'people',
      data: { fullName: `Fake ${TAG} closed earlier`, email: to } as never,
      overrideAccess: true,
    })
    await payload.update({
      collection: 'people',
      id: earlier.id,
      data: { account: accountId },
      overrideAccess: true,
    })
    // Another consent of the own record, under a fake text that took effect long ago, so that
    // it is never the text in force for anyone else's test.
    const reviews = await payload.create({
      collection: 'consent-versions',
      data: {
        purpose: 'testimonialPublication',
        language: 'en-IN',
        text: `Fake consent text for publishing a review (${TAG}).`,
        effectiveFrom: '2001-01-01T04:30:00.000Z',
        effectiveFrom_tz: 'Asia/Kolkata',
      } as never,
      overrideAccess: true,
    })
    await payload.create({
      collection: 'consents',
      data: {
        person: personId,
        noticeVersion: reviews.id,
        channel: 'web',
        grantedAt: new Date(Date.now() - 60_000).toISOString(),
        evidence: { form: `Fake form ${TAG}` },
      } as never,
      overrideAccess: true,
    })
    // A paid booking of the own record, its captured payment and its invoice (as M3 and M4
    // leave them; tests/int/documents.int.spec.ts), on a fake service and practitioner.
    const service = await payload.create({
      collection: 'services',
      data: {
        name: `Fake service ${TAG}`,
        type: 'session',
        slug: `${SERVICE_SLUG}-${RUN}`,
        register: 'counselling',
        format: 'online',
      } as never,
    })
    const practitioner = await payload.create({
      collection: 'practitioners',
      data: { publicName: `Fake ${TAG}` } as never,
    })
    const booking = await payload.create({
      collection: 'bookings',
      data: {
        reference: `INT-ACC-${RUN}`.slice(0, 20),
        type: 'session',
        status: 'confirmed',
        paymentStatus: 'paid',
        service: service.id,
        person: personId,
        practitioner: practitioner.id,
        durationMinutes: 30,
        startsAt: '2099-09-14T04:30:00.000Z',
        endsAt: '2099-09-14T05:00:00.000Z',
        price: {
          totalPaise: 118_000,
          taxPaise: 18_000,
          gstRateBasisPoints: 1800,
          sacCode: '000000',
        },
      } as never,
    })
    const payment = await payload.create({
      collection: 'payments',
      data: {
        booking: booking.id,
        kind: 'checkout',
        gateway: 'razorpay',
        status: 'captured',
        amountPaise: 118_000,
        currency: 'INR',
        receipt: `booking:${booking.id}:checkout`,
        gatewayOrderId: `order_FAKEACC${booking.id}`,
        gatewayPaymentId: `pay_FAKEACC${booking.id}`,
        capturedAt: new Date().toISOString(),
      } as never,
    })
    const invoice = await payload.create({
      collection: 'invoices',
      data: {
        kind: 'taxInvoice',
        status: 'issued',
        number: `FAKE-ACC-${RUN}`,
        booking: booking.id,
        issuedAt: new Date().toISOString(),
        totals: { taxablePaise: 100_000, cgstPaise: 9_000, sgstPaise: 9_000, totalPaise: 118_000 },
        idempotencyKey: `fake-${TAG}-${RUN}`,
      } as never,
    })
    // A second device: a session of its own besides the account step's.
    const { headers: started } = await auth.api.startSession({
      body: { userId, trusted: true },
      returnHeaders: true,
    })
    const secondDevice = started
      .getSetCookie()
      .map((line) => line.split(';')[0])
      .join('; ')
    const context = await auth.$context
    expect(await context.internalAdapter.listSessions(userId)).toHaveLength(2)

    // The person closes it from My IIIC, on the request accountRequest builds for them
    // (src/lib/accounts/scope.ts): the address, the browser, and the account as the actor.
    const req = await createLocalReq(
      {
        req: {
          headers: new Headers({
            'x-forwarded-for': '203.0.113.250',
            'user-agent': 'Mozilla/5.0 (Fake test browser) Chrome/131.0 Safari/537.36',
          }),
        },
        context: { auditActor: { id: `account:${accountId}` } },
      },
      payload,
    )
    expect(await closeAccount(req, { accountId, reason: 'person' })).toEqual({
      ok: true,
      value: { closed: true },
    })

    // Every session ended, the second device's included; Better Auth's user is gone.
    expect(await context.internalAdapter.listSessions(userId)).toHaveLength(0)
    expect(await auth.api.getSession({ headers: new Headers({ cookie: secondDevice }) })).toBeNull()
    expect(await context.internalAdapter.findUserById(userId)).toBeNull()
    // Both records kept, neither linked to an account any more.
    for (const id of [personId, earlier.id]) {
      const record = await payload.findByID({ collection: 'people', id, depth: 0 })
      expect(record.account ?? null, String(id)).toBeNull()
    }
    // The booking, its payment and its invoice are the office's records: kept as they were.
    const keptBooking = await payload.findByID({ collection: 'bookings', id: booking.id, depth: 0 })
    expect(keptBooking).toMatchObject({ status: 'confirmed', person: personId })
    expect(
      await payload.findByID({ collection: 'payments', id: payment.id, depth: 0 }),
    ).toMatchObject({ status: 'captured', booking: booking.id })
    expect(
      await payload.findByID({ collection: 'invoices', id: invoice.id, depth: 0 }),
    ).toMatchObject({ status: 'issued', booking: booking.id })
    // Only the account consent is withdrawn, with the evidence of the person's own request.
    expect(await consentFor(payload, personId, 'account')).toBe('withdrawn')
    expect(await consentFor(payload, personId, 'testimonialPublication')).toBe('granted')
    const { docs: withdrawals } = await payload.find({
      collection: 'consents',
      where: { and: [{ person: { equals: personId } }, { withdraws: { exists: true } }] },
      depth: 0,
    })
    expect(withdrawals).toHaveLength(1)
    expect(withdrawals[0]).toMatchObject({
      purpose: 'account',
      evidence: {
        form: 'My IIIC',
        ip: '203.0.113.250',
        userAgent: 'Mozilla/5.0 (Fake test browser) Chrome/131.0 Safari/537.36',
      },
    })
    // One close-account entry, in the account's name, from the person's address.
    const { docs: entries } = await payload.find({
      collection: 'audit-log',
      where: {
        and: [{ action: { equals: 'close-account' } }, { entityId: { equals: String(accountId) } }],
      },
      depth: 0,
      overrideAccess: true,
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      actorId: `account:${accountId}`,
      changed: 'person',
      ip: '203.0.113.250',
    })
  })

  it('answers not-found for an account that is not there', async () => {
    expect(
      await closeAccount(await createLocalReq({}, payload), {
        accountId: 987_654_321,
        reason: 'person',
      }),
    ).toEqual({ ok: false, error: { code: 'not-found' } })
  })
})
