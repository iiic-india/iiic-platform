// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  connectionCard,
  defaultDisplayForm,
  excerptKeepsWords,
  FIRST_VOICE,
  formOfName,
  isCounsellingPage,
  placementProblems,
  REVIEW_MESSAGES,
  reviewProblems,
  SCREENING_TESTS,
  shownName,
  slotCapacity,
  takesVoices,
  whenShown,
  wordCount,
  type ReviewDraft,
} from '@/lib/proof/reviews'

// The rules of the reviews IIIC publishes (docs/04 `testimonials`; docs/08 §6; D-37;
// copy architecture §6), as pure functions. Obviously fake names and words.
const ALL_TESTS = Object.fromEntries(SCREENING_TESTS.map(({ name }) => [name, true]))

/** A review ready for its writer's consent, with fake facts. */
const READY: ReviewDraft = {
  status: 'consentRequested',
  person: 7,
  text: 'Fake review words for a test. The programme changed how I plan my week. Fake ending.',
  language: 'en-IN',
  programme: 'Fake leadership programme',
  year: 2016,
  place: 'Fakepur',
  connection: 'none',
  screening: { result: 'passes', tests: ALL_TESTS },
}

const paths = (review: ReviewDraft) => reviewProblems(review).map((problem) => problem.path)

describe('the name on the card (D-37)', () => {
  it('shows the name in the form the person chose', () => {
    expect(shownName('Asha Fakename', 'full')).toBe('Asha Fakename')
    expect(shownName('Asha Fakename', 'firstNameInitial')).toBe('Asha F.')
    expect(shownName('Asha Kumari Fakename', 'initials')).toBe('A. K. F.')
    expect(shownName('  asha   fakename ', 'initials')).toBe('A. F.')
    expect(shownName('Asha', 'firstNameInitial')).toBe('Asha')
    expect(shownName(null, 'full')).toBe('')
  })

  it('starts counselling reviews with initials, and others with the full name', () => {
    expect(defaultDisplayForm(['counselling'])).toBe('initials')
    expect(defaultDisplayForm(['consultancy', 'counselling'])).toBe('initials')
    expect(defaultDisplayForm(['education'])).toBe('full')
    expect(defaultDisplayForm(undefined)).toBe('full')
  })

  it('reads which form a name in the intake sheet takes', () => {
    expect(formOfName('Example Person', 'Example Person')).toBe('full')
    expect(formOfName('Example Person', 'Example P.')).toBe('firstNameInitial')
    expect(formOfName('Example Person', 'E. P.')).toBe('initials')
    expect(formOfName('Example Person', 'E.P.')).toBe('initials')
    expect(formOfName('Example Person', 'Someone Else')).toBeNull()
    expect(formOfName('Example Person', '')).toBeNull()
  })
})

describe('an excerpt (D-37: only as written)', () => {
  const text = 'Fake first sentence here. Fake second sentence, longer. Fake third one.'

  it('keeps the review’s own words, in order, with an ellipsis where words are left out', () => {
    expect(excerptKeepsWords(text, 'Fake first sentence here.')).toBe(true)
    expect(excerptKeepsWords(text, 'Fake first sentence here. … Fake third one.')).toBe(true)
    expect(excerptKeepsWords(text, '…second sentence, longer...')).toBe(true)
    expect(excerptKeepsWords(text, 'Fake  first\nsentence here.')).toBe(true)
  })

  it('refuses changed words, words out of order and an empty excerpt', () => {
    expect(excerptKeepsWords(text, 'Fake first sentence there.')).toBe(false)
    expect(excerptKeepsWords(text, 'Fake third one. … Fake first sentence here.')).toBe(false)
    expect(excerptKeepsWords(text, '…')).toBe(false)
  })
})

describe('what a review needs for its status (docs/05, Proof)', () => {
  it('lets a review be received with its words alone', () => {
    expect(reviewProblems({ status: 'received', text: 'Fake words.' })).toEqual([])
    expect(paths({ status: 'received' })).toEqual(['text'])
  })

  it('asks for a screening result before screened, and a reason for a failure', () => {
    expect(paths({ status: 'screened', text: 'Fake.' })).toEqual(['screening.result'])
    expect(
      paths({ status: 'screened', text: 'Fake.', screening: { result: 'notPublishable' } }),
    ).toEqual(['screening.reason'])
    expect(
      paths({
        status: 'screened',
        text: 'Fake.',
        screening: { result: 'needsInformation', reason: 'Fake: test 2, no year given.' },
      }),
    ).toEqual([])
  })

  it('passes a review only with every one of the eight tests ticked', () => {
    const tests = { ...ALL_TESTS, notAnkvishwa: false }
    expect(
      reviewProblems({ status: 'screened', text: 'Fake.', screening: { result: 'passes', tests } }),
    ).toEqual([{ path: 'screening.result', message: REVIEW_MESSAGES.passesNeedsTests }])
  })

  it('sends for consent only a review that passed, with the caption’s facts', () => {
    expect(reviewProblems(READY)).toEqual([])
    expect(
      paths({ ...READY, screening: { result: 'needsInformation', reason: 'Fake.' } }),
    ).toContain('screening.result')
    expect(paths({ ...READY, programme: '', year: null, place: ' ', connection: null })).toEqual([
      'programme',
      'year',
      'place',
      'connection',
    ])
    expect(paths({ ...READY, person: null })).toEqual(['person'])
  })

  it('asks for an English translation of a review in another language', () => {
    expect(paths({ ...READY, language: 'gu-IN' })).toEqual(['translation'])
    expect(paths({ ...READY, language: 'gu-IN', translation: 'Fake translation.' })).toEqual([])
    expect(paths({ ...READY, translation: 'Fake translation.' })).toEqual(['translation'])
  })

  it('asks for the consent before approved and published', () => {
    expect(paths({ ...READY, status: 'approved' })).toEqual(['consent'])
    expect(paths({ ...READY, status: 'approved', consent: 12 })).toEqual([])
  })

  it('publishes an excerpt and a translation only once the person approved them', () => {
    const published = {
      ...READY,
      status: 'published',
      consent: 12,
      language: 'hi-IN',
      translation: 'Fake translation.',
      excerpt: 'The programme changed how I plan my week.',
    }
    expect(paths(published)).toEqual(['excerptApproved', 'translationApproved'])
    expect(paths({ ...published, excerptApproved: true, translationApproved: true })).toEqual([])
  })

  it('refuses a photograph or a link the person did not agree to, and a link that is not https', () => {
    expect(paths({ ...READY, photo: 5 })).toEqual(['photo'])
    expect(paths({ ...READY, photo: 5, photoAgreed: true })).toEqual([])
    expect(paths({ ...READY, profileLink: 'https://example.invalid/fake' })).toEqual([
      'profileLink',
    ])
    expect(
      paths({ ...READY, profileLink: 'http://example.invalid/fake', profileLinkAgreed: true }),
    ).toEqual(['profileLink'])
  })

  it('takes no review from the feedback form by hand', () => {
    expect(paths({ ...READY, origin: 'platformFeedback' })).toEqual(['origin'])
  })

  it('checks nothing on a withdrawn review, whose words are gone', () => {
    expect(reviewProblems({ status: 'withdrawn', text: null, placements: [] })).toEqual([])
  })
})

describe('where a review is pinned (docs/11 §3.8; copy architecture §6)', () => {
  it('takes voices on the home, framework and founders’ pages and the doors only', () => {
    for (const page of ['home', 'framework', 'founders', 'organisations', 'learn', 'counselling']) {
      expect(takesVoices(page), page).toBe(true)
    }
    expect(takesVoices('organisations/team-map')).toBe(true)
    for (const page of ['legal', 'privacy', 'about', 'map', 'proof', 'book', '']) {
      expect(takesVoices(page), page).toBe(false)
    }
  })

  it('draws counselling’s voices as up to three plain cards, and one beside a section elsewhere', () => {
    expect(isCounsellingPage('counselling')).toBe(true)
    expect(isCounsellingPage('framework')).toBe(false)
    expect(slotCapacity('counselling')).toBe(3)
    expect(slotCapacity('home')).toBe(1)
  })

  it('refuses another page, a section that is not a link name, the first voice off home and a page twice', () => {
    const review = (placements: ReviewDraft['placements']) =>
      placementProblems({ ...READY, placements }).map((problem) => problem.path)
    expect(review([{ page: 'home', section: FIRST_VOICE }])).toEqual([])
    expect(review([{ page: 'legal', section: 'scope' }])).toEqual(['placements.0.page'])
    expect(review([{ page: 'home', section: 'Not A Name' }])).toEqual(['placements.0.section'])
    expect(review([{ page: 'learn', section: FIRST_VOICE }])).toEqual(['placements.0.section'])
    expect(
      review([
        { page: 'framework', section: 'what-changes' },
        { page: 'framework', section: 'pillars' },
      ]),
    ).toEqual(['placements.1.page'])
  })

  it('keeps to about 60 words beside a section and 25 under the hero, counting the excerpt', () => {
    const long = Array.from({ length: 61 }, (_, index) => `fake${index}`).join(' ')
    const beside = [{ page: 'framework', section: 'what-changes' }]
    expect(placementProblems({ text: long, placements: beside })).toHaveLength(1)
    const excerpt = long.split(' ').slice(0, 20).join(' ')
    expect(placementProblems({ text: long, excerpt, placements: beside })).toEqual([])
    expect(
      placementProblems({
        text: long,
        excerpt,
        placements: [{ page: 'home', section: FIRST_VOICE }],
      }),
    ).toEqual([])
    expect(
      placementProblems({
        text: excerpt + ' a b c d e f',
        placements: [{ page: 'home', section: FIRST_VOICE }],
      }),
    ).toHaveLength(1)
    expect(wordCount('  fake   words\nhere ')).toBe(3)
  })
})

describe('the card’s lines (docs/08 §6; review-consent-request.md)', () => {
  it('discloses a connection in the consent message’s words, and nothing when there is none', () => {
    expect(connectionCard('friend')).toBe('Friend of Gaurang Mistry')
    expect(connectionCard('workedWith')).toBe('Worked with IIIC')
    expect(connectionCard('none')).toBeNull()
    expect(connectionCard(undefined)).toBeNull()
  })

  it('shows the year, or the month and year', () => {
    expect(whenShown(2016)).toBe('2016')
    expect(whenShown(2016, 3)).toBe('March 2016')
    expect(whenShown(null)).toBe('')
  })
})
