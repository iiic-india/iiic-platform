import {
  ValidationError,
  type CollectionAfterChangeHook,
  type CollectionAfterDeleteHook,
  type CollectionBeforeChangeHook,
  type CollectionBeforeValidateHook,
  type CollectionConfig,
  type Field,
  type FieldAccess,
  type FilterOptions,
  type PayloadRequest,
  type Where,
} from 'payload'

import { allow, allowField, FIELD_POLICY, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { revalidateReviews } from '@/lib/content/revalidate'
import { idOf } from '@/lib/privacy/consentLedger'
import { consentProblem, PUBLICATION, slotProblems } from '@/lib/proof/ledger'
import {
  CONNECTIONS,
  DISPLAY_FORMS,
  defaultDisplayForm,
  REVIEW_DOORS,
  REVIEW_MESSAGES,
  REVIEW_ORIGINS,
  REVIEW_SOURCES,
  REVIEW_STATUSES,
  reached,
  reviewProblems,
  SCREENING_RESULTS,
  SCREENING_TESTS,
  shownName,
  whenShown,
  WITHDRAWN_FIELDS,
  type DisplayForm,
  type Problem,
  type ReviewDraft,
} from '@/lib/proof/reviews'
import { LANGUAGES } from '@/lib/site/languages'
import { IST_FIELD } from '@/lib/time/ist'

type Data = Record<string, unknown> & ReviewDraft

/** Every problem at once, beside its field, as the admin shows them. */
function refuse(problems: Problem[]): never {
  throw new ValidationError({ collection: 'testimonials', errors: problems })
}

/** The review as it will be saved: what is stored, with what this save changes. */
const merged = (data: Data | undefined, originalDoc: unknown): Data =>
  ({ ...((originalDoc as Data | undefined) ?? {}), ...(data ?? {}) }) as Data

/**
 * Before the checks: a withdrawn review stays withdrawn and keeps nothing a withdrawal removes
 * (docs/04); a review without a chosen name form takes the default, initials for counselling
 * (D-37).
 */
export const prepareReview: CollectionBeforeValidateHook = async ({ data, originalDoc }) => {
  const review = merged(data as Data, originalDoc)
  if ((originalDoc as Data | undefined)?.status === 'withdrawn' && review.status !== 'withdrawn') {
    refuse([{ path: 'status', message: REVIEW_MESSAGES.withdrawnStays }])
  }
  if (review.status === 'withdrawn') return { ...data, ...WITHDRAWN_FIELDS }
  if (!review.displayForm) return { ...data, displayForm: defaultDisplayForm(review.doors) }
  return data
}

/** The person behind a review, as far as the card needs them: their name and age band. */
async function personOf(req: PayloadRequest, value: unknown) {
  const id = idOf(value)
  if (id === null) return null
  return req.payload.findByID({
    collection: 'people',
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    select: { fullName: true, ageBand: true },
    req,
  })
}

/** The name the admin lists a review by: the card's name and its programme, never a full name it does not show. */
export function reviewTitle(review: {
  programme?: string | null
  year?: number | null
  month?: unknown
  shown: string
}) {
  const month = typeof review.month === 'number' ? review.month : null
  const programme = [review.programme, whenShown(review.year, month)].filter(Boolean).join(', ')
  return [review.shown || 'Name not set', programme || 'Programme not given'].join(' · ')
}

/**
 * The rules of a review (src/lib/proof/reviews.ts, docs/05 Proof), checked on every save:
 * - what its status needs: a screening result, a pass and the caption's facts before a consent
 *   request, the person's consent before approved and published, an approved excerpt and
 *   translation before published;
 * - a review is approved or published only while the person's consent to publish a testimonial
 *   is in force (CLAUDE.md #4, D-37);
 * - only an owner publishes, and only an owner changes a published review, except to withdraw it
 *   at the person's request (docs/05: anything that publishes proof needs an owner);
 * - the name is the person's, in the form they chose: initials for anyone under 18;
 * - each page slot holds what it can: one review beside a section, three on counselling.
 */
export const checkReview: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  const review = merged(data as Data, originalDoc)
  const status = review.status ?? 'received'
  const problems = reviewProblems(review)

  const person = await personOf(req, review.person)
  const form = (review.displayForm ?? 'full') as DisplayForm
  if (person?.ageBand === 'under18' && form !== 'initials') {
    problems.push({ path: 'displayForm', message: REVIEW_MESSAGES.under18 })
  }

  const before = (originalDoc as Data | undefined)?.status
  const owner = hasRole(req.user, 'owner')
  if (before === 'published' && status !== 'withdrawn' && !owner) {
    problems.push({ path: 'status', message: REVIEW_MESSAGES.ownerChangesPublished })
  } else if (status === 'published' && before !== 'published' && !owner) {
    problems.push({ path: 'status', message: REVIEW_MESSAGES.ownerPublishes })
  }
  const unlinked = problems.some(({ path }) => path === 'person' || path === 'consent')
  if (reached(status, 'approved') && !unlinked) {
    const problem = await consentProblem(req, review)
    if (problem) problems.push(problem)
  }
  if (status !== 'withdrawn') {
    const id = operation === 'update' ? (originalDoc as { id?: number | string })?.id : undefined
    problems.push(...(await slotProblems(req, id, review.placements)))
  }
  if (problems.length) refuse(problems)

  const shown = shownName(person?.fullName, form)
  const next: Data = { ...data, shownName: shown || null, title: reviewTitle({ ...review, shown }) }
  if (status === 'published' && before !== 'published') {
    next.publishedAt = new Date().toISOString()
    next.approvedBy = req.user?.id ?? null
  }
  return next
}

/**
 * After a save: the pages that show reviews read them anew, at once (docs/06 V2), and a
 * withdrawal deletes the photograph it removed from the review (docs/04).
 */
export const afterReviewChange: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  const photo = idOf(previousDoc?.photo)
  if (doc.status === 'withdrawn' && photo !== null && idOf(doc.photo) === null) {
    await req.payload.delete({
      collection: 'media',
      where: { id: { equals: photo } },
      overrideAccess: true,
      req,
    })
  }
  if (doc.status === 'published' || previousDoc?.status === 'published') revalidateReviews()
  return doc
}

/** A deleted review takes its photograph with it, and the pages read the reviews anew. */
export const afterReviewDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const photo = idOf(doc?.photo)
  if (photo !== null) {
    await req.payload.delete({
      collection: 'media',
      where: { id: { equals: photo } },
      overrideAccess: true,
      req,
    })
  }
  if (doc?.status === 'published') revalidateReviews()
  return doc
}

/** The record behind the card (S2): the staff who moderate reviews, never a visitor. */
const record = {
  read: allowField(FIELD_POLICY.testimonialRecord.read),
  create: allowField(FIELD_POLICY.testimonialRecord.write),
  update: allowField(FIELD_POLICY.testimonialRecord.write),
}

/**
 * A field the card shows only when the person agreed to it: the staff read it always, a visitor
 * only on a review where the flag beside it is ticked.
 */
function shownWhen(flag: string): { read: FieldAccess } {
  const staff = allowField(FIELD_POLICY.testimonialRecord.read)
  return {
    read: async (args) => (await staff(args)) || (args.doc as Data | undefined)?.[flag] === true,
  }
}

/** Set by the platform, never typed. */
const byThePlatform = { create: () => false, update: () => false }

/** Only consents this person gave to publish a testimonial, not withdrawals, can be linked. */
const theirPublicationConsents: FilterOptions = ({ data }) => {
  const person = idOf((data as Data | undefined)?.person)
  const where: Where[] = [{ purpose: { equals: PUBLICATION } }, { withdraws: { exists: false } }]
  if (person !== null) where.push({ person: { equals: person } })
  return { and: where }
}

const screeningTests: Field[] = SCREENING_TESTS.map(({ name, label }) => ({
  name,
  type: 'checkbox',
  label,
  defaultValue: false,
}))

/**
 * Reviews of Gaurang Mistry's programmes, earlier and new (docs/04 `testimonials`; docs/05,
 * Proof; D-37). S2 until published, then only the card's fields are public (FIELD_POLICY); the
 * person, the source, where the original is kept, the screening, the consent and the notes stay
 * with the staff who moderate reviews. A review is published only while the person's consent to
 * publish is in force; a withdrawal in the consent ledger unpublishes it at once and removes its
 * words, translation, excerpt, photograph and link, while the consent entries stay
 * (src/lib/proof/ledger.ts). The original file waits for the private documents bucket; until
 * then the review records where IIIC keeps it. Every write is in the audit log.
 */
export const Testimonials: CollectionConfig = {
  slug: 'testimonials',
  labels: { singular: 'Review', plural: 'Reviews' },
  admin: {
    group: 'Proof',
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'doors', 'updatedAt'],
    listSearchableFields: ['title', 'programme', 'intakeRef'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.testimonials.read.roles),
    description:
      'Reviews of Gaurang Mistry’s programmes: received, screened, sent for consent, approved by the writer, published by an owner.',
  },
  // src/access/policy.ts (docs/05): the operator moderates, owners publish; anyone reads a
  // published review's card; only an owner deletes one.
  access: {
    read: allow(POLICY.testimonials.read),
    create: allow(POLICY.testimonials.create),
    update: allow(POLICY.testimonials.update),
    delete: allow(POLICY.testimonials.delete),
  },
  // Visitors read published reviews without signing in, so the staff two-factor wrapper
  // (payload-totp) stays off this one operation; the read rule and the field rules ask for the
  // code themselves. Every write still needs a verified code.
  custom: { totp: { disableAccessWrapper: { read: true } } },
  defaultSort: '-updatedAt',
  disableBulkEdit: true,
  hooks: {
    beforeValidate: [prepareReview],
    beforeChange: [checkReview],
    afterChange: [afterReviewChange],
    afterDelete: [afterReviewDelete],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      access: byThePlatform,
      admin: { readOnly: true, position: 'sidebar', description: 'Named by the platform.' },
    },
    {
      name: 'status',
      type: 'select',
      options: [...REVIEW_STATUSES],
      required: true,
      defaultValue: 'received',
      index: true,
      admin: {
        position: 'sidebar',
        description:
          'Received → screened → consent requested → approved (the writer said yes) → published (an owner). Withdrawn removes the words at once.',
      },
    },
    {
      name: 'publishedAt',
      type: 'date',
      label: 'Published',
      timezone: IST_FIELD,
      access: byThePlatform,
      admin: { readOnly: true, position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'approvedBy',
      type: 'relationship',
      relationTo: 'users',
      label: 'Published by',
      access: { ...byThePlatform, read: record.read },
      admin: { readOnly: true, position: 'sidebar', description: 'The owner who published it.' },
    },
    {
      name: 'intakeRef',
      type: 'text',
      label: 'Intake sheet reference',
      unique: true,
      index: true,
      maxLength: 40,
      access: record,
      admin: {
        position: 'sidebar',
        description: 'The Ref column of the reviews intake sheet, for a review imported from it.',
      },
    },
    {
      name: 'origin',
      type: 'select',
      options: [...REVIEW_ORIGINS],
      required: true,
      defaultValue: 'earlierProgramme',
      admin: {
        position: 'sidebar',
        description:
          'Reviews added here are from earlier programmes; the feedback form adds its own.',
      },
    },
    {
      type: 'collapsible',
      label: 'The person',
      fields: [
        {
          name: 'person',
          type: 'relationship',
          relationTo: 'people',
          index: true,
          access: record,
          admin: { description: 'Who wrote it. Their contact details never leave the admin.' },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'displayForm',
              type: 'select',
              label: 'Name shown as',
              options: [...DISPLAY_FORMS],
              required: true,
              admin: {
                description:
                  'The form the person chose. Counselling reviews start with initials; under 18, initials only.',
              },
            },
            {
              name: 'shownName',
              type: 'text',
              label: 'Name on the card',
              access: byThePlatform,
              admin: { readOnly: true, description: 'From the person’s name, in the form chosen.' },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'designation', type: 'text', maxLength: 120 },
            {
              name: 'place',
              type: 'text',
              maxLength: 120,
              admin: { description: 'City; state or country.' },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'organisation',
              type: 'text',
              maxLength: 160,
              access: shownWhen('showOrganisation'),
            },
            {
              name: 'showOrganisation',
              type: 'checkbox',
              label: 'Show the organisation',
              defaultValue: false,
              admin: { description: 'Only if the person agreed.' },
            },
          ],
        },
        {
          name: 'connection',
          type: 'select',
          label: 'Connection to Gaurang Mistry or IIIC',
          options: CONNECTIONS.map(({ value, label }) => ({ value, label })),
          admin: {
            description:
              'Disclosed on the card when there is one (docs/08 §6). Leave empty until known.',
          },
        },
        {
          name: 'incentive',
          type: 'text',
          label: 'Anything received for the review',
          maxLength: 200,
          admin: {
            description:
              'A discount, a free session or a gift given for this review, in a few words; disclosed on the card (docs/08 §6). Never offer one.',
          },
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'The programme',
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'programme',
              type: 'text',
              maxLength: 160,
              admin: { description: 'As it was called.' },
            },
            {
              name: 'service',
              type: 'relationship',
              relationTo: 'services',
              admin: { description: 'Today’s equivalent, if there is one.' },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'year', type: 'number', min: 1980, max: 2100 },
            {
              name: 'month',
              type: 'number',
              min: 1,
              max: 12,
              admin: { description: 'If known, 1 to 12.' },
            },
          ],
        },
        {
          name: 'doors',
          type: 'select',
          hasMany: true,
          options: [...REVIEW_DOORS],
          admin: { description: 'The doors it speaks to: Proof filters by these.' },
        },
        {
          name: 'themes',
          type: 'text',
          hasMany: true,
          maxLength: 60,
          access: record,
          admin: {
            description:
              'Outcome themes from docs/content/outcomes-map.md, for choosing which voice sits beside which section. Never shown.',
          },
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'The words',
      fields: [
        {
          name: 'text',
          type: 'textarea',
          label: 'The review, exactly as written',
          maxLength: 5000,
          admin: {
            description: 'Paste it as written, spelling and language included. Never correct it.',
          },
        },
        {
          name: 'language',
          type: 'select',
          options: [...LANGUAGES],
          required: true,
          defaultValue: 'en-IN',
        },
        {
          name: 'translation',
          type: 'textarea',
          label: 'English translation',
          maxLength: 5000,
          access: shownWhen('translationApproved'),
        },
        {
          type: 'row',
          fields: [
            { name: 'translator', type: 'text', maxLength: 120, access: record },
            {
              name: 'translationApproved',
              type: 'checkbox',
              label: 'The person approved the translation',
              defaultValue: false,
            },
          ],
        },
        {
          name: 'excerpt',
          type: 'textarea',
          maxLength: 800,
          access: shownWhen('excerptApproved'),
          admin: {
            description:
              'The part shown beside a section, in the review’s own words, with an ellipsis (…) where words are left out.',
          },
        },
        {
          name: 'excerptApproved',
          type: 'checkbox',
          label: 'The person approved the excerpt',
          defaultValue: false,
        },
        {
          type: 'row',
          fields: [
            {
              name: 'photo',
              type: 'upload',
              relationTo: 'media',
              access: shownWhen('photoAgreed'),
              admin: { description: 'Only with the person’s agreement to a photograph.' },
            },
            {
              name: 'photoAgreed',
              type: 'checkbox',
              label: 'Photograph agreed',
              defaultValue: false,
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'profileLink',
              type: 'text',
              label: 'Profile link',
              maxLength: 300,
              access: shownWhen('profileLinkAgreed'),
            },
            {
              name: 'profileLinkAgreed',
              type: 'checkbox',
              label: 'Profile link agreed',
              defaultValue: false,
            },
          ],
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Source, screening and consent',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'source', type: 'select', options: [...REVIEW_SOURCES], access: record },
            {
              name: 'receivedOn',
              type: 'date',
              label: 'Received',
              timezone: IST_FIELD,
              access: record,
              admin: { date: { pickerAppearance: 'dayOnly' } },
            },
          ],
        },
        {
          name: 'originalReference',
          type: 'text',
          label: 'Where the original is kept',
          maxLength: 300,
          access: record,
          admin: {
            description:
              'In IIIC’s own storage, such as Reviews/Originals/R-001.jpg. The file itself is kept here once the private documents bucket exists.',
          },
        },
        {
          name: 'screening',
          type: 'group',
          access: record,
          admin: {
            description: 'The eight tests (copy architecture §6), before any consent request.',
          },
          fields: [
            {
              name: 'result',
              type: 'select',
              options: [...SCREENING_RESULTS],
              defaultValue: 'notScreened',
            },
            { name: 'tests', type: 'group', label: 'Tests', fields: screeningTests },
            {
              name: 'reason',
              type: 'textarea',
              maxLength: 1000,
              admin: { description: 'For a review that does not pass: which test, and why.' },
            },
          ],
        },
        {
          name: 'consent',
          type: 'relationship',
          relationTo: 'consents',
          access: record,
          filterOptions: theirPublicationConsents,
          admin: {
            description:
              'The person’s consent to publish a testimonial, recorded under Privacy → Consent log with their reply as evidence.',
          },
        },
        {
          name: 'notes',
          type: 'textarea',
          maxLength: 2000,
          access: record,
          admin: { description: 'For the office. Never shown.' },
        },
      ],
    },
    {
      name: 'placements',
      type: 'array',
      labels: { singular: 'Placement', plural: 'Placements' },
      admin: {
        description:
          'Where the review is pinned: a page and the link name of the section it sits beside, or first-voice under the home page’s hero. One review beside a section; up to three on the counselling page.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'page',
              type: 'text',
              required: true,
              maxLength: 80,
              admin: {
                description: 'The page’s address without the slash: home, framework, learn…',
              },
            },
            {
              name: 'section',
              type: 'text',
              required: true,
              maxLength: 40,
              admin: { description: 'The section’s link name.' },
            },
          ],
        },
      ],
    },
  ],
}
