/**
 * The rules of the reviews IIIC publishes (docs/04 `testimonials`; docs/08 §6; D-37;
 * docs/content/copy-architecture.md §6), as pure functions: the collection's hooks, the pages
 * and the tests read the same rules. A review is published only with its writer's consent for
 * this use, only as written, with the name in the form they chose; counselling reviews show
 * initials and place unless the person chose more; a withdrawal takes the words down at once.
 */

/** Where a review came from: an earlier programme of Gaurang Mistry's, or the feedback form (M3). */
export const REVIEW_ORIGINS = [
  { value: 'earlierProgramme', label: 'An earlier programme' },
  { value: 'platformFeedback', label: 'The feedback form on this site' },
] as const

/**
 * The life of a review (docs/05, Proof): received, screened against the eight tests, sent for
 * the writer's consent, approved by them, published by an owner; or declined, or withdrawn.
 */
export const REVIEW_STATUSES = [
  { value: 'received', label: 'Received' },
  { value: 'screened', label: 'Screened' },
  { value: 'consentRequested', label: 'Consent requested' },
  { value: 'approved', label: 'Approved by the writer' },
  { value: 'published', label: 'Published' },
  { value: 'declined', label: 'Declined' },
  { value: 'withdrawn', label: 'Withdrawn' },
] as const

export type ReviewStatus = (typeof REVIEW_STATUSES)[number]['value']

/** The doors a review speaks to (docs/04): the three applications and the framework itself. */
export const REVIEW_DOORS = [
  { value: 'consultancy', label: 'Consultancy' },
  { value: 'education', label: 'Education' },
  { value: 'counselling', label: 'Counselling' },
  { value: 'framework', label: 'Framework' },
] as const

export type ReviewDoor = (typeof REVIEW_DOORS)[number]['value']

/** How the writer's name is shown, in the form they chose (D-37). */
export const DISPLAY_FORMS = [
  { value: 'full', label: 'Full name' },
  { value: 'firstNameInitial', label: 'First name and surname initial' },
  { value: 'initials', label: 'Initials' },
] as const

export type DisplayForm = (typeof DISPLAY_FORMS)[number]['value']

/**
 * Where the review came from (docs/04, with the intake sheet's own "Instagram" and "Other").
 * Staff only: it says nothing the card shows.
 */
export const REVIEW_SOURCES = [
  { value: 'letter', label: 'Letter' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'feedbackForm', label: 'Feedback form' },
  { value: 'brochure', label: 'Brochure' },
  { value: 'googleReview', label: 'Google review' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'video', label: 'Video' },
  { value: 'inPerson', label: 'In person' },
  { value: 'other', label: 'Other' },
] as const

/**
 * The writer's connection to Gaurang Mistry or IIIC, disclosed on the card when there is one
 * (docs/08 §6). The card's words are the consent message's (docs/content/review-consent-request.md).
 */
export const CONNECTIONS = [
  { value: 'none', label: 'None', card: null },
  { value: 'friend', label: 'Friend of Gaurang Mistry', card: 'Friend of Gaurang Mistry' },
  { value: 'relative', label: 'Relative of Gaurang Mistry', card: 'Relative of Gaurang Mistry' },
  { value: 'worksWith', label: 'Works with IIIC', card: 'Works with IIIC' },
  { value: 'workedWith', label: 'Worked with IIIC', card: 'Worked with IIIC' },
] as const

export type Connection = (typeof CONNECTIONS)[number]['value']

/** The screening result (copy architecture §6). */
export const SCREENING_RESULTS = [
  { value: 'notScreened', label: 'Not screened yet' },
  { value: 'passes', label: 'Passes every test' },
  { value: 'needsInformation', label: 'Needs information' },
  { value: 'notPublishable', label: 'Not publishable' },
] as const

export type ScreeningResult = (typeof SCREENING_RESULTS)[number]['value']

/** The eight screening tests, in the copy architecture's words (§6), each a box to tick. */
export const SCREENING_TESTS = [
  {
    name: 'original',
    label: '1. IIIC holds the original (a letter, a message, a form, a post, a recording).',
  },
  { name: 'programmeAndYear', label: '2. It names a real programme and its year.' },
  { name: 'ownExperience', label: '3. It describes the person’s own experience.' },
  {
    name: 'noClinicalClaim',
    label:
      '4. It states no diagnosis, cure or clinical result, and claims nothing IIIC could not claim itself, such as a prediction.',
  },
  { name: 'noOtherPerson', label: '5. It names no other private person or their circumstances.' },
  {
    name: 'adultConsents',
    label:
      '6. The person is an adult now and consents themselves; for anyone under 18, a parent consents and the card shows initials only.',
  },
  {
    name: 'notAnkvishwa',
    label: '7. It is not about the AnkVishwa assessment or predictions (D-26).',
  },
  {
    name: 'excerptKeepsMeaning',
    label: '8. An excerpt, if one is proposed, keeps the meaning of the whole.',
  },
] as const

export type ScreeningTest = (typeof SCREENING_TESTS)[number]['name']

/** The page slots a review can be pinned to (docs/11 §3.8; copy architecture §6). */
export const FIRST_VOICE = 'first-voice'

/**
 * The pages that carry voices (copy architecture §6, "Where reviews go"): the home page, the
 * framework and founders' pages and the three doors with the consultancy offers. Never the
 * booking flow, the Map, error or legal pages.
 */
export function takesVoices(page: string): boolean {
  return (
    ['home', 'framework', 'founders', 'organisations', 'learn', 'counselling'].includes(page) ||
    /^organisations\/[a-z0-9-]+$/.test(page)
  )
}

/** Counselling pages draw their voices as plain cards in the text (docs/11 §3.8). */
export function isCounsellingPage(page: string | undefined): boolean {
  return page === 'counselling' || (page?.startsWith('counselling/') ?? false)
}

/** How many reviews one slot holds: one beside a section; up to three cards on counselling. */
export function slotCapacity(page: string): number {
  return isCounsellingPage(page) ? 3 : 1
}

/** The words a slot may show: about 60 beside a section, 25 under the home page's hero. */
export function wordLimit(section: string): number {
  return section === FIRST_VOICE ? 25 : 60
}

/** The messages the rules give, in VOICE.md's interface voice. */
export const REVIEW_MESSAGES = {
  person: 'Choose the person who wrote the review.',
  text: 'Paste the review exactly as written.',
  withdrawnStays: 'A withdrawn review stays withdrawn. Add the review again if the person asks.',
  screening: 'Screen the review first: choose its screening result.',
  passesNeedsTests: 'A review passes only when every one of the eight tests is ticked.',
  failNeedsReason: 'Say which test the review fails, and why.',
  notPassed: 'Only a review that passes every screening test goes to its writer for consent.',
  programme: 'Name the programme as it was called.',
  year: 'Enter the year the person took the programme.',
  place: 'Enter the place the card shows.',
  connection:
    'Say whether the writer has a connection to Gaurang Mistry or IIIC: the card discloses it.',
  consent: 'Link the consent the person gave to publish their review.',
  consentNotTheirs:
    'Link a consent to publish a testimonial that this person gave, not a withdrawal.',
  consentNotInForce:
    'This person’s consent to publish is not in force: it was withdrawn or never given.',
  ownerPublishes: 'Only an owner publishes a review.',
  ownerChangesPublished:
    'Only an owner changes a published review. To take it down at the person’s request, set it to Withdrawn.',
  excerptWords:
    'An excerpt keeps the review’s own words: each part must appear in the review exactly as written, with an ellipsis (…) where words are left out.',
  excerptApproval: 'The person approves the excerpt before it is published: tick its approval.',
  translationApproval:
    'The person approves the translation before it is published: tick its approval.',
  translationWithEnglish: 'A review written in English needs no translation.',
  translationNeeded: 'Add the English translation the person approves.',
  under18: 'For anyone under 18 the card shows initials only.',
  photoAgreed: 'Add a photograph only when the person agreed to it.',
  linkAgreed: 'Add a profile link only when the person agreed to it.',
  linkFormat: 'Enter the full address, starting with https://.',
  platformOrigin:
    'A review from the feedback form is added by the form itself, with the booking it comes from.',
  placementPage:
    'Reviews are shown on the home, framework and founders’ pages and the three doors, not on this page.',
  placementSection:
    'Use the section’s link name: small letters, numbers and hyphens, such as how-it-works.',
  firstVoiceHome: 'Only the home page has a first voice under its hero.',
  placementTwice: 'A review appears once per page.',
  tooLong: (limit: number) =>
    `This slot shows up to ${limit} words: add an excerpt the person approved, or choose a shorter review.`,
  slotTaken: (page: string, section: string, capacity: number) =>
    capacity === 1
      ? `Another review is already pinned beside “${section}” on ${pagePathOf(page)}.`
      : `${pagePathOf(page)} already shows ${capacity} reviews in “${section}”.`,
} as const

/** A page's address from its slug: "/" for the home page. */
export function pagePathOf(page: string): string {
  return page === 'home' ? '/' : `/${page}`
}

/** A review's statuses from received onwards, in the order a review moves through them. */
const ORDER: ReviewStatus[] = ['received', 'screened', 'consentRequested', 'approved', 'published']

/** Whether a status is at or past another on the way to publication. */
export function reached(status: unknown, step: ReviewStatus): boolean {
  const at = ORDER.indexOf(status as ReviewStatus)
  return at >= 0 && at >= ORDER.indexOf(step)
}

/** Whether a review is counselling's, which shows initials and place by default (D-37). */
export function isCounsellingReview(doors: unknown): boolean {
  return Array.isArray(doors) && doors.includes('counselling')
}

/** The name form a new review starts with: initials for counselling, else the full name. */
export function defaultDisplayForm(doors: unknown): DisplayForm {
  return isCounsellingReview(doors) ? 'initials' : 'full'
}

/** The words of a name, without stray spaces. */
function nameParts(fullName: string): string[] {
  return fullName.trim().split(/\s+/).filter(Boolean)
}

/** A name part's first letter, capitalised, with a full stop. */
const initialOf = (part: string) => `${Array.from(part)[0]?.toLocaleUpperCase('en-IN') ?? ''}.`

/**
 * The name as the card shows it, in the form the person chose: "Asha Example" in full, as
 * "Asha E." or as "A. E.". A single name stays itself, or its initial.
 */
export function shownName(fullName: string | null | undefined, form: DisplayForm): string {
  const parts = nameParts(fullName ?? '')
  if (parts.length === 0) return ''
  if (form === 'full') return parts.join(' ')
  if (form === 'initials') return parts.map(initialOf).join(' ')
  if (parts.length === 1) return parts[0]!
  return `${parts[0]} ${initialOf(parts[parts.length - 1]!)}`
}

/** The form a name written in the intake sheet takes, or null when it is none of the three. */
export function formOfName(fullName: string, asShown: string): DisplayForm | null {
  const squash = (value: string) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-IN')
  const wanted = squash(asShown)
  if (!wanted) return null
  for (const { value } of DISPLAY_FORMS) {
    if (squash(shownName(fullName, value)) === wanted) return value
  }
  // "E.P." and "E P" are initials written without spaces or stops.
  const letters = (value: string) => squash(value).replace(/[.\s]/g, '')
  return letters(shownName(fullName, 'initials')) === letters(asShown) ? 'initials' : null
}

/** How many words a text holds. */
export function wordCount(text: string | null | undefined): number {
  return (text ?? '').trim().split(/\s+/).filter(Boolean).length
}

const squashSpaces = (value: string) => value.replace(/\s+/g, ' ').trim()

/**
 * Whether an excerpt keeps the review's own words (D-37: only as written): each part between
 * the ellipses appears in the review as written, in order. Spacing may differ; words may not.
 */
export function excerptKeepsWords(text: string, excerpt: string): boolean {
  const whole = squashSpaces(text)
  const parts = excerpt
    .split(/…|\.\.\./)
    .map(squashSpaces)
    .filter((part) => part !== '')
  if (parts.length === 0) return false
  let from = 0
  for (const part of parts) {
    const at = whole.indexOf(part, from)
    if (at < 0) return false
    from = at + part.length
  }
  return true
}

/** The fields of a review the rules read. A relationship comes as an id or populated. */
export type ReviewDraft = {
  status?: string | null
  origin?: string | null
  person?: unknown
  text?: string | null
  language?: string | null
  translation?: string | null
  translationApproved?: boolean | null
  excerpt?: string | null
  excerptApproved?: boolean | null
  programme?: string | null
  year?: number | null
  place?: string | null
  connection?: string | null
  consent?: unknown
  displayForm?: string | null
  photo?: unknown
  photoAgreed?: boolean | null
  profileLink?: string | null
  profileLinkAgreed?: boolean | null
  screening?: {
    result?: string | null
    reason?: string | null
    tests?: Partial<Record<ScreeningTest, boolean | null>> | null
  } | null
  placements?: { page?: string | null; section?: string | null }[] | null
}

export type Problem = { path: string; message: string }

const blank = (value: unknown) =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '')

/**
 * What a review lacks for its status, field by field (docs/05, Proof): screened needs a
 * screening result; a consent request needs a pass and the caption's facts; approved and
 * published need the consent linked (whether it is in force is read from the ledger, on the
 * server). A withdrawn review has nothing left to check.
 */
export function reviewProblems(review: ReviewDraft): Problem[] {
  const problems: Problem[] = []
  const add = (path: string, message: string) => problems.push({ path, message })
  const status = review.status ?? 'received'
  if (status === 'withdrawn') return problems
  if (review.origin === 'platformFeedback') add('origin', REVIEW_MESSAGES.platformOrigin)
  if (blank(review.text)) add('text', REVIEW_MESSAGES.text)

  const screening = review.screening ?? {}
  const result = screening.result ?? 'notScreened'
  if (
    result === 'passes' &&
    !SCREENING_TESTS.every(({ name }) => screening.tests?.[name] === true)
  ) {
    add('screening.result', REVIEW_MESSAGES.passesNeedsTests)
  }
  if ((result === 'needsInformation' || result === 'notPublishable') && blank(screening.reason)) {
    add('screening.reason', REVIEW_MESSAGES.failNeedsReason)
  }

  if (!blank(review.excerpt) && !blank(review.text)) {
    if (!excerptKeepsWords(review.text!, review.excerpt!))
      add('excerpt', REVIEW_MESSAGES.excerptWords)
  }
  if (review.language === 'en-IN' && !blank(review.translation)) {
    add('translation', REVIEW_MESSAGES.translationWithEnglish)
  }
  if (!blank(review.photo) && review.photoAgreed !== true) add('photo', REVIEW_MESSAGES.photoAgreed)
  if (!blank(review.profileLink)) {
    if (review.profileLinkAgreed !== true) add('profileLink', REVIEW_MESSAGES.linkAgreed)
    else if (!/^https:\/\/[^\s]+$/.test(review.profileLink!))
      add('profileLink', REVIEW_MESSAGES.linkFormat)
  }

  if (reached(status, 'screened') && result === 'notScreened') {
    add('screening.result', REVIEW_MESSAGES.screening)
  }
  if (reached(status, 'consentRequested')) {
    if (result !== 'passes') add('screening.result', REVIEW_MESSAGES.notPassed)
    if (blank(review.person)) add('person', REVIEW_MESSAGES.person)
    if (blank(review.programme)) add('programme', REVIEW_MESSAGES.programme)
    if (blank(review.year)) add('year', REVIEW_MESSAGES.year)
    if (blank(review.place)) add('place', REVIEW_MESSAGES.place)
    if (blank(review.connection)) add('connection', REVIEW_MESSAGES.connection)
    if (review.language && review.language !== 'en-IN' && blank(review.translation)) {
      add('translation', REVIEW_MESSAGES.translationNeeded)
    }
  }
  if (reached(status, 'approved') && blank(review.consent)) add('consent', REVIEW_MESSAGES.consent)
  if (status === 'published') {
    if (!blank(review.excerpt) && review.excerptApproved !== true) {
      add('excerptApproved', REVIEW_MESSAGES.excerptApproval)
    }
    if (!blank(review.translation) && review.translationApproved !== true) {
      add('translationApproved', REVIEW_MESSAGES.translationApproval)
    }
  }
  return problems.concat(placementProblems(review))
}

/** A section's link name, as the page blocks take it (src/blocks/pageBlocks.ts, isAnchor). */
const SECTION = /^[a-z][a-z0-9-]{0,39}$/

/**
 * What is wrong with a review's own placements: a page that takes no voices, a section name
 * that is not a link name, the first voice off the home page, a page twice, or words beyond
 * what the slot shows. Whether a slot is already taken is read on the server.
 */
export function placementProblems(review: ReviewDraft): Problem[] {
  const problems: Problem[] = []
  const pages = new Set<string>()
  for (const [index, placement] of (review.placements ?? []).entries()) {
    const page = placement.page ?? ''
    const section = placement.section ?? ''
    const at = (field: string) => `placements.${index}.${field}`
    if (!takesVoices(page))
      problems.push({ path: at('page'), message: REVIEW_MESSAGES.placementPage })
    if (section === FIRST_VOICE && page !== 'home') {
      problems.push({ path: at('section'), message: REVIEW_MESSAGES.firstVoiceHome })
    } else if (!SECTION.test(section)) {
      problems.push({ path: at('section'), message: REVIEW_MESSAGES.placementSection })
    }
    if (pages.has(page))
      problems.push({ path: at('page'), message: REVIEW_MESSAGES.placementTwice })
    pages.add(page)
    const limit = wordLimit(section)
    if (wordCount(wordsShownBeside(review)) > limit) {
      problems.push({ path: at('section'), message: REVIEW_MESSAGES.tooLong(limit) })
    }
  }
  return problems
}

/** The words a voice beside the text shows: the excerpt the person approved, else the review. */
export function wordsShownBeside(review: Pick<ReviewDraft, 'text' | 'excerpt'>): string {
  return blank(review.excerpt) ? (review.text ?? '') : review.excerpt!
}

/**
 * What a withdrawal removes (docs/04): the words, any translation and excerpt, the photograph
 * and the profile link, and every placement. What the review was, when it arrived and the
 * consent it was published under stay on record; the consent entries stay in the ledger.
 */
export const WITHDRAWN_FIELDS = {
  text: null,
  translation: null,
  translator: null,
  translationApproved: false,
  excerpt: null,
  excerptApproved: false,
  photo: null,
  photoAgreed: false,
  profileLink: null,
  profileLinkAgreed: false,
  placements: [],
} as const

/** The card's line about a connection, or null when there is none to disclose. */
export function connectionCard(connection: unknown): string | null {
  return CONNECTIONS.find((item) => item.value === connection)?.card ?? null
}

/** The year, or the month and year, as the card shows it: "2016", "March 2016". */
export function whenShown(year: number | null | undefined, month?: number | null): string {
  if (!year) return ''
  if (!month) return String(year)
  const name = new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-IN', {
    month: 'long',
    timeZone: 'UTC',
  })
  return `${name} ${year}`
}
