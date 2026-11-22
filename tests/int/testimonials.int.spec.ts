import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ROLES, type Role } from '@/access/roles'
import { idOf } from '@/lib/privacy/consentLedger'
import { importIntake } from '@/lib/proof/importIntake'
import { COLUMNS, parseIntakeRows } from '@/lib/proof/intake'
import { SCREENING_TESTS } from '@/lib/proof/reviews'
import type { Consent, ConsentVersion, Person, Testimonial, User } from '@/payload-types'
import config from '@/payload.config'

// Reviews (docs/04 `testimonials`; D-37) against the real database: who reads and writes them,
// the published card as the only thing a visitor reads, the consent gate (a review is published
// only while the person's consent to publish is in force), a withdrawal in the consent ledger
// that takes the review down at once while the consent entries stay, and the intake sheet's
// import, run twice. Obviously fake people, staff, words and rows. Consent texts in force are
// kept for good, so each run adds its own; consent entries are never deleted, and stay without
// a person once this file's people are deleted at the end.
let payload: Payload
const email = (label: string) => `int.reviews.${label}@example.invalid`
const PASSWORD = 'test-only-password-reviews'
const NAME = 'Fake Person int.reviews'
const REF = 'INT-REVIEWS'
const staff = {} as Record<Role, User>
/** A staff user as Payload sees them after they entered their two-factor code. */
const verified = (user: User) => ({ ...user, collection: 'users', _strategy: 'totp' }) as User
const DAY = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()
let notice: ConsentVersion

async function removeTestData() {
  // Deleting a person deletes their reviews (docs/04); a review left by a broken run goes too.
  await payload.delete({ collection: 'people', where: { fullName: { like: 'int.reviews' } } })
  await payload.delete({ collection: 'testimonials', where: { intakeRef: { like: REF } } })
  await payload.delete({ collection: 'users', where: { email: { like: 'int.reviews.' } } })
}

const person = (label: string, fields: Partial<Person> = {}) =>
  payload.create({
    collection: 'people',
    data: { fullName: `${NAME} ${label}`, ...fields } as Person,
  })

/** The person's yes to publishing, recorded by the operator from their reply. */
const consentOf = (someone: Person) =>
  payload.create({
    collection: 'consents',
    data: {
      person: someone.id,
      noticeVersion: notice.id,
      channel: 'whatsapp',
      grantedAt: ago(2),
      evidence: { reference: 'fake-reply-int-reviews.png' },
    } as Consent,
  })

const ALL_TESTS = Object.fromEntries(SCREENING_TESTS.map(({ name }) => [name, true]))

/** A review that passed screening, by the operator. */
const review = (someone: Person, fields: Partial<Testimonial> = {}) =>
  payload.create({
    collection: 'testimonials',
    data: {
      status: 'consentRequested',
      person: someone.id,
      designation: 'Fake designation',
      organisation: 'Fake Hidden Org',
      showOrganisation: false,
      place: 'Fakepur',
      programme: 'Fake programme',
      year: 2016,
      doors: ['consultancy'],
      text: 'Fake review words, exactly as written.',
      language: 'en-IN',
      connection: 'none',
      source: 'whatsapp',
      originalReference: 'Fake/Originals/int-reviews.png',
      notes: 'Fake office note.',
      screening: { result: 'passes', tests: ALL_TESTS },
      ...fields,
    } as Testimonial,
    user: verified(staff.operator),
    overrideAccess: false,
  })

const publish = (id: number, user: User) =>
  payload.update({
    collection: 'testimonials',
    id,
    data: { status: 'published' },
    user: verified(user),
    overrideAccess: false,
  })

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  for (const role of ROLES) {
    staff[role] = await payload.create({
      collection: 'users',
      data: { name: `Fake ${role}`, email: email(role), password: PASSWORD, roles: [role] },
    })
  }
  notice = await payload.create({
    collection: 'consent-versions',
    data: {
      purpose: 'testimonialPublication',
      language: 'en-IN',
      text: 'Fake consent message for publishing a review (int.reviews).',
      effectiveFrom: ago(30),
    } as ConsentVersion,
  })
})

afterAll(async () => {
  await removeTestData()
})

describe('who reads and writes reviews (docs/05, Proof)', () => {
  it('lets the operator and owners add and read them, and no other role', async () => {
    const someone = await person('roles')
    for (const role of ROLES) {
      const added = payload.create({
        collection: 'testimonials',
        data: { text: `Fake words by ${role}.`, person: someone.id } as Testimonial,
        user: verified(staff[role]),
        overrideAccess: false,
      })
      if (role === 'owner' || role === 'operator') await expect(added, role).resolves.toBeTruthy()
      else await expect(added, role).rejects.toThrow()
    }
    await expect(
      payload.create({
        collection: 'testimonials',
        data: { text: 'Fake words by nobody.' } as Testimonial,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('shows a visitor, and every other role, nothing until a review is published', async () => {
    const draft = await review(await person('draft'))
    await expect(
      payload.findByID({ collection: 'testimonials', id: draft.id, overrideAccess: false }),
    ).rejects.toThrow()
    for (const role of ['editor', 'practitioner', 'finance'] as const) {
      await expect(
        payload.findByID({
          collection: 'testimonials',
          id: draft.id,
          user: verified(staff[role]),
          overrideAccess: false,
        }),
        role,
      ).rejects.toThrow()
    }
    const read = await payload.findByID({
      collection: 'testimonials',
      id: draft.id,
      user: verified(staff.operator),
      overrideAccess: false,
    })
    expect(read).toMatchObject({ notes: 'Fake office note.', organisation: 'Fake Hidden Org' })
  })
})

describe('publishing, only with consent (CLAUDE.md #4; D-37)', () => {
  it('refuses to approve or publish a review without the person’s consent', async () => {
    const draft = await review(await person('no consent'))
    await expect(
      payload.update({
        collection: 'testimonials',
        id: draft.id,
        data: { status: 'approved' },
        user: verified(staff.operator),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await expect(publish(draft.id, staff.owner)).rejects.toThrow()
  })

  it('lets an owner, and not the operator, publish while the consent is in force', async () => {
    const someone = await person('consents')
    const consent = await consentOf(someone)
    const draft = await review(someone, { consent: consent.id })
    const approved = await payload.update({
      collection: 'testimonials',
      id: draft.id,
      data: { status: 'approved' },
      user: verified(staff.operator),
      overrideAccess: false,
    })
    expect(approved.status).toBe('approved')
    await expect(publish(draft.id, staff.operator)).rejects.toThrow()
    const published = await publish(draft.id, staff.owner)
    expect(published).toMatchObject({ status: 'published', shownName: `${NAME} consents` })
    expect(idOf(published.approvedBy)).toBe(staff.owner.id)
    expect(published.publishedAt).toBeTruthy()
  })

  it('gives a visitor the published card, and nothing of the record behind it', async () => {
    const someone = await person('card')
    const draft = await review(someone, { consent: (await consentOf(someone)).id })
    await publish(draft.id, staff.owner)
    const card = await payload.findByID({
      collection: 'testimonials',
      id: draft.id,
      overrideAccess: false,
    })
    expect(card).toMatchObject({
      status: 'published',
      text: 'Fake review words, exactly as written.',
      place: 'Fakepur',
      programme: 'Fake programme',
    })
    for (const field of [
      'person',
      'consent',
      'notes',
      'screening',
      'source',
      'originalReference',
      'intakeRef',
      'approvedBy',
      'organisation',
    ]) {
      expect(card, field).not.toHaveProperty(field)
    }
    // A visitor cannot look for reviews by what they may not read.
    await expect(
      payload.find({
        collection: 'testimonials',
        where: { person: { equals: someone.id } },
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    const all = await payload.find({
      collection: 'testimonials',
      overrideAccess: false,
      limit: 100,
    })
    expect(all.docs.every((doc) => doc.status === 'published')).toBe(true)
  })

  it('starts a counselling review with initials (D-37)', async () => {
    const draft = await review(await person('counselling'), { doors: ['counselling'] })
    expect(draft).toMatchObject({ displayForm: 'initials', shownName: 'F. P. I. C.' })
  })
})

describe('a withdrawal (docs/06 V2)', () => {
  it('unpublishes at once and removes the words, while the consent entries stay', async () => {
    const someone = await person('withdraws')
    const consent = await consentOf(someone)
    const draft = await review(someone, {
      consent: consent.id,
      placements: [{ page: 'framework', section: 'int-reviews-slot' }],
    })
    await publish(draft.id, staff.owner)
    const withdrawal = await payload.create({
      collection: 'consents',
      data: { withdraws: consent.id, channel: 'whatsapp' } as Consent,
      user: verified(staff.operator),
      overrideAccess: false,
    })
    const after = await payload.findByID({ collection: 'testimonials', id: draft.id })
    expect(after).toMatchObject({ status: 'withdrawn', text: null, excerpt: null, placements: [] })
    await expect(
      payload.findByID({ collection: 'testimonials', id: draft.id, overrideAccess: false }),
    ).rejects.toThrow()
    const { totalDocs } = await payload.count({
      collection: 'consents',
      where: { id: { in: [consent.id, withdrawal.id] } },
    })
    expect(totalDocs).toBe(2)
    // A withdrawn review stays withdrawn.
    await expect(
      payload.update({
        collection: 'testimonials',
        id: draft.id,
        data: { status: 'published', text: 'Fake words again.' },
        user: verified(staff.owner),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('goes with the person when their record is deleted (docs/04)', async () => {
    const someone = await person('erased')
    const draft = await review(someone)
    await payload.delete({ collection: 'people', id: someone.id })
    await expect(payload.findByID({ collection: 'testimonials', id: draft.id })).rejects.toThrow()
  })
})

describe('the intake sheet’s import (I-42)', () => {
  const HEADERS = Object.values(COLUMNS)
  const rowOf = (cells: Partial<Record<keyof typeof COLUMNS, unknown>>) =>
    (Object.keys(COLUMNS) as (keyof typeof COLUMNS)[]).map((key) => cells[key] ?? null)
  const fake = (n: number, cells: Partial<Record<keyof typeof COLUMNS, unknown>> = {}) =>
    rowOf({
      ref: `${REF}-${n}`,
      fullName: `${NAME} import ${n}`,
      text: `Fake imported words number ${n}.`,
      screening: 'Passes',
      area: 'Education',
      programme: 'Fake programme',
      year: 2015,
      place: 'Fakepur',
      connection: 'None',
      ...cells,
    })

  it('records the people, the reviews at received and the consents with their evidence, once', async () => {
    const sheet = [
      HEADERS,
      fake(1, {
        consentStatus: 'Yes, initials only',
        consentDate: new Date(ago(3)),
        consentEvidence: 'Fake/Consents/int-reviews-1.eml',
        contact: 'int.reviews.import1@example.invalid',
      }),
      fake(2, { consentStatus: 'Asked, no reply yet' }),
      // A yes from before any consent text was in force cannot be recorded: the row waits.
      fake(3, {
        consentStatus: 'Yes, as shown',
        consentDate: new Date(ago(400)),
        consentEvidence: 'Fake/Consents/int-reviews-3.png',
      }),
    ]
    const { rows, problems } = parseIntakeRows(sheet)
    expect(problems).toEqual([])
    const first = await importIntake(payload, rows)
    expect(first.imported).toEqual([`${REF}-1`, `${REF}-2`])
    expect(first.refused.map((problem) => problem.ref)).toEqual([`${REF}-3`])

    const imported = await payload.find({
      collection: 'testimonials',
      where: { intakeRef: { like: REF } },
      sort: 'intakeRef',
      depth: 1,
    })
    expect(imported.docs.map((doc) => doc.status)).toEqual(['received', 'received'])
    const [one, two] = imported.docs
    expect(one).toMatchObject({ displayForm: 'initials', shownName: 'F. P. I. I. 1.' })
    const consent = one!.consent as Consent
    expect(consent).toMatchObject({
      purpose: 'testimonialPublication',
      channel: 'email',
      evidence: expect.objectContaining({ reference: 'Fake/Consents/int-reviews-1.eml' }),
    })
    expect((one!.person as Person).email).toBe('int.reviews.import1@example.invalid')
    expect(two!.consent).toBeFalsy()
    // Nothing of a refused row is recorded.
    expect(
      await payload.count({
        collection: 'people',
        where: { fullName: { equals: `${NAME} import 3` } },
      }),
    ).toMatchObject({ totalDocs: 0 })

    const again = await importIntake(payload, rows)
    expect(again.imported).toEqual([])
    expect(again.alreadyImported).toEqual([`${REF}-1`, `${REF}-2`])
    expect(
      await payload.count({
        collection: 'people',
        where: { fullName: { like: `${NAME} import` } },
      }),
    ).toMatchObject({ totalDocs: 2 })
    expect(
      await payload.count({
        collection: 'consents',
        where: { 'evidence.reference': { equals: 'Fake/Consents/int-reviews-1.eml' } },
      }),
    ).toMatchObject({ totalDocs: 1 })
  })
})
