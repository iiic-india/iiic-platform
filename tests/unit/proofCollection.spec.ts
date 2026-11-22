// @vitest-environment node
import { ValidationError } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { afterReviewChange, checkReview, prepareReview } from '@/collections/Testimonials'
import { revalidateReviews } from '@/lib/content/revalidate'
import { BY_THE_LEDGER, withdrawReviewsOnWithdrawal } from '@/lib/proof/ledger'
import { REVIEW_MESSAGES, SCREENING_TESTS, WITHDRAWN_FIELDS } from '@/lib/proof/reviews'

vi.mock('@/lib/content/revalidate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/content/revalidate')>()),
  revalidateReviews: vi.fn(),
}))

// The hooks of the reviews collection and the consent ledger's part in them (docs/04
// `testimonials`; D-37), against a fake Payload: the consent gate, the owner who publishes, the
// name in the form chosen, the slots, and a withdrawal that takes the words down. The database
// rules themselves are in tests/int. Obviously fake people, ids and words.
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

/** The fake database: people, consent entries and reviews, by collection. */
let people: Record<number, { id: number; fullName: string; ageBand?: string }>
let consents: Record<string, unknown>[]
let reviews: Record<string, unknown>[]

const payload = {
  findByID: vi.fn(async ({ collection, id }: { collection: string; id: number }) => {
    if (collection === 'people') return people[id] ?? null
    if (collection === 'consents') return consents.find((entry) => entry.id === id) ?? null
    return null
  }),
  find: vi.fn(async ({ collection }: { collection: string }) => ({
    docs: collection === 'consents' ? consents : collection === 'testimonials' ? reviews : [],
  })),
  update: vi.fn(),
  delete: vi.fn(),
}

const OWNER = { id: 1, roles: ['owner'], active: true, _strategy: 'totp' }
const OPERATOR = { id: 2, roles: ['operator'], active: true, _strategy: 'totp' }
const req = (user: unknown = OWNER, context: Record<string, unknown> = {}) =>
  ({ payload, user, context }) as never

type Hook = (args: Record<string, unknown>) => unknown
const run = (hook: unknown, args: Record<string, unknown>) => (hook as Hook)(args)

async function refusals(promise: unknown): Promise<{ path?: string; message?: string }[]> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError)
    return (error as ValidationError).data.errors
  }
  throw new Error('fake: expected a refusal')
}

const GRANT = {
  id: 41,
  person: 7,
  purpose: 'testimonialPublication',
  grantedAt: ago(10),
  channel: 'whatsapp',
}

/** A review approved by its fake writer, ready for an owner to publish. */
const APPROVED = {
  id: 90,
  status: 'approved',
  person: 7,
  displayForm: 'full',
  text: 'Fake words about a fake programme.',
  language: 'en-IN',
  programme: 'Fake programme',
  year: 2016,
  place: 'Fakepur',
  connection: 'none',
  consent: 41,
  screening: {
    result: 'passes',
    tests: Object.fromEntries(SCREENING_TESTS.map(({ name }) => [name, true])),
  },
  placements: [] as { page: string; section: string }[],
}

beforeEach(() => {
  people = { 7: { id: 7, fullName: 'Asha Fakename', ageBand: 'adult' } }
  consents = [GRANT]
  reviews = []
  payload.update.mockReset()
  payload.delete.mockReset()
  vi.mocked(revalidateReviews).mockReset()
})

describe('before the checks', () => {
  it('starts a counselling review with initials (D-37)', async () => {
    expect(
      await run(prepareReview, {
        data: { doors: ['counselling'], text: 'Fake.' },
        originalDoc: undefined,
      }),
    ).toMatchObject({ displayForm: 'initials' })
    expect(
      await run(prepareReview, { data: { doors: ['education'] }, originalDoc: undefined }),
    ).toMatchObject({ displayForm: 'full' })
  })

  it('removes the words, media, link and placements of a withdrawn review (docs/04)', async () => {
    expect(
      await run(prepareReview, { data: { status: 'withdrawn' }, originalDoc: APPROVED }),
    ).toMatchObject(WITHDRAWN_FIELDS)
  })

  it('keeps a withdrawn review withdrawn', async () => {
    const [problem] = await refusals(
      run(prepareReview, {
        data: { status: 'received' },
        originalDoc: { ...APPROVED, status: 'withdrawn' },
      }),
    )
    expect(problem).toEqual({ path: 'status', message: REVIEW_MESSAGES.withdrawnStays })
  })
})

describe('publishing (CLAUDE.md #4; D-37; docs/05)', () => {
  const publish = (user: unknown, original = APPROVED, data: Record<string, unknown> = {}) =>
    run(checkReview, {
      data: { ...original, status: 'published', ...data },
      originalDoc: original,
      operation: 'update',
      req: req(user),
    })

  it('lets an owner publish while the person’s consent is in force, and records who and when', async () => {
    const saved = (await publish(OWNER)) as Record<string, unknown>
    expect(saved).toMatchObject({
      status: 'published',
      shownName: 'Asha Fakename',
      approvedBy: 1,
      title: 'Asha Fakename · Fake programme, 2016',
    })
    expect(Date.parse(String(saved.publishedAt))).toBeGreaterThan(Date.now() - 60_000)
  })

  it('refuses an operator', async () => {
    expect(await refusals(publish(OPERATOR))).toEqual([
      { path: 'status', message: REVIEW_MESSAGES.ownerPublishes },
    ])
  })

  it('refuses a review whose consent was withdrawn, or never linked', async () => {
    consents = [
      GRANT,
      {
        id: 42,
        withdraws: 41,
        purpose: 'testimonialPublication',
        person: 7,
        grantedAt: GRANT.grantedAt,
        withdrawnAt: ago(1),
      },
    ]
    expect(await refusals(publish(OWNER))).toEqual([
      { path: 'consent', message: REVIEW_MESSAGES.consentNotInForce },
    ])
    consents = [GRANT]
    expect(await refusals(publish(OWNER, { ...APPROVED, consent: null as never }))).toEqual([
      { path: 'consent', message: REVIEW_MESSAGES.consent },
    ])
  })

  it('refuses a consent for another purpose, or another person’s', async () => {
    consents = [{ ...GRANT, purpose: 'marketingEmail' }]
    expect(await refusals(publish(OWNER))).toEqual([
      { path: 'consent', message: REVIEW_MESSAGES.consentNotTheirs },
    ])
    consents = [{ ...GRANT, person: 8 }]
    expect(await refusals(publish(OWNER))).toEqual([
      { path: 'consent', message: REVIEW_MESSAGES.consentNotTheirs },
    ])
  })

  it('lets only an owner change a published review, and the operator withdraw it', async () => {
    const published = { ...APPROVED, status: 'published' }
    expect(
      await refusals(
        run(checkReview, {
          data: { place: 'Elsewhere' },
          originalDoc: published,
          operation: 'update',
          req: req(OPERATOR),
        }),
      ),
    ).toEqual([{ path: 'status', message: REVIEW_MESSAGES.ownerChangesPublished }])
    await expect(
      run(checkReview, {
        data: { status: 'withdrawn', ...WITHDRAWN_FIELDS },
        originalDoc: published,
        operation: 'update',
        req: req(OPERATOR),
      }),
    ).resolves.toMatchObject({ status: 'withdrawn' })
  })

  it('shows initials only for anyone under 18', async () => {
    people[7] = { id: 7, fullName: 'Asha Fakename', ageBand: 'under18' }
    expect(await refusals(publish(OWNER))).toEqual([
      { path: 'displayForm', message: REVIEW_MESSAGES.under18 },
    ])
    expect(await publish(OWNER, { ...APPROVED, displayForm: 'initials' })).toMatchObject({
      shownName: 'A. F.',
    })
  })

  it('keeps one review beside a section, counting the others still in play', async () => {
    reviews = [{ id: 91, placements: [{ page: 'framework', section: 'what-changes' }] }]
    const placed = { ...APPROVED, placements: [{ page: 'framework', section: 'what-changes' }] }
    const [problem] = await refusals(publish(OWNER, placed))
    expect(problem?.path).toBe('placements.0.section')
    reviews = [{ id: 91, placements: [{ page: 'framework', section: 'pillars' }] }]
    await expect(publish(OWNER, placed)).resolves.toMatchObject({ status: 'published' })
  })
})

describe('after a save', () => {
  it('marks the reviews stale when a published review changes, and not for a draft decision', async () => {
    await run(afterReviewChange, {
      doc: { ...APPROVED, status: 'published' },
      previousDoc: APPROVED,
      req: req(),
    })
    expect(revalidateReviews).toHaveBeenCalledTimes(1)
    await run(afterReviewChange, { doc: APPROVED, previousDoc: APPROVED, req: req() })
    expect(revalidateReviews).toHaveBeenCalledTimes(1)
  })

  it('deletes the photograph a withdrawal removed', async () => {
    await run(afterReviewChange, {
      doc: { ...APPROVED, status: 'withdrawn', photo: null },
      previousDoc: { ...APPROVED, status: 'published', photo: 55 },
      req: req(),
    })
    expect(payload.delete).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'media', where: { id: { equals: 55 } } }),
    )
  })
})

describe('a withdrawal in the consent ledger (docs/06 V2)', () => {
  const WITHDRAWAL = {
    id: 42,
    withdraws: 41,
    person: 7,
    purpose: 'testimonialPublication',
    grantedAt: GRANT.grantedAt,
    withdrawnAt: ago(0),
  }

  it('withdraws every review of the person still in play, in its own request', async () => {
    consents = [GRANT, WITHDRAWAL]
    reviews = [{ id: 90 }, { id: 93 }]
    const request = req(OPERATOR)
    await run(withdrawReviewsOnWithdrawal, { doc: WITHDRAWAL, operation: 'create', req: request })
    expect(payload.update).toHaveBeenCalledTimes(2)
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'testimonials',
        id: 90,
        data: { status: 'withdrawn' },
        context: { [BY_THE_LEDGER]: true },
        req: request,
      }),
    )
  })

  it('leaves the reviews while a newer consent keeps the purpose in force', async () => {
    const newer = { ...GRANT, id: 43, grantedAt: ago(0) }
    const old = { ...WITHDRAWAL, withdrawnAt: ago(2) }
    consents = [GRANT, old, newer]
    await run(withdrawReviewsOnWithdrawal, { doc: old, operation: 'create', req: req() })
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('does nothing for a consent given, or a withdrawal for another purpose', async () => {
    await run(withdrawReviewsOnWithdrawal, { doc: GRANT, operation: 'create', req: req() })
    await run(withdrawReviewsOnWithdrawal, {
      doc: { ...WITHDRAWAL, purpose: 'marketingEmail' },
      operation: 'create',
      req: req(),
    })
    expect(payload.update).not.toHaveBeenCalled()
  })
})
