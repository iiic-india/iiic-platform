import { z } from 'zod'

import { toE164 } from '@/lib/phone'

import {
  defaultDisplayForm,
  formOfName,
  SCREENING_TESTS,
  type Connection,
  type DisplayForm,
  type ReviewDoor,
  type ScreeningResult,
} from './reviews'

/**
 * The reviews intake sheet (docs/content/reviews-intake-template.xlsx, its Reviews sheet; I-42),
 * read row by row into what the platform records: the person, the review at status received,
 * and the consent the person gave with its evidence (docs/content/review-consent-request.md).
 * Pure: the sheet itself is read with read-excel-file (src/scripts/import-reviews.ts), and the
 * records are written by ./importIntake.ts. The columns are found by their headers, so a column
 * moved in IIIC's copy is still read; the calculated columns (Caption preview, Ready for consent
 * request?) and the Format column are not imported.
 */

/** The sheet the reviews are on, and the headers of the columns read. */
export const INTAKE_SHEET = 'Reviews'

export const COLUMNS = {
  ref: 'Ref',
  fullName: 'Full name',
  receivedOn: 'Received on',
  screening: 'Screening',
  screeningNote: 'Screening note',
  nameAsShown: 'Name as it will appear',
  designation: 'Designation',
  organisation: 'Organisation',
  showOrganisation: 'Show organisation?',
  place: 'Place (city)',
  area: 'Area',
  programme: 'Programme (as it was called)',
  year: 'Year',
  text: 'The review, exactly as written',
  language: 'Language',
  translation: 'English translation (if not in English)',
  source: 'Where it came from',
  original: 'Where the original is kept',
  connection: 'Connection to Gaurang Mistry or IIIC',
  under18: 'Under 18 now?',
  consentStatus: 'Consent status',
  consentDate: 'Consent date',
  consentEvidence: 'Consent evidence (file name)',
  changes: 'Changes the person asked for',
  linkedin: 'LinkedIn (only if they agree)',
  photo: 'Photo',
  notes: 'Notes',
  contact: 'Contact for the consent request (PRIVATE)',
} as const

type Column = keyof typeof COLUMNS

/** The sheet's dropdown values (its Lists sheet), as the platform records them. */
const SCREENING: Record<string, ScreeningResult> = {
  'Not screened': 'notScreened',
  Passes: 'passes',
  'Needs information': 'needsInformation',
  'Not publishable': 'notPublishable',
}

const AREA: Record<string, ReviewDoor[]> = {
  Consultancy: ['consultancy'],
  Education: ['education'],
  Counselling: ['counselling'],
  'Other (not an IIIC programme)': [],
}

const LANGUAGE: Record<string, string> = { English: 'en-IN', Gujarati: 'gu-IN', Hindi: 'hi-IN' }

const SOURCE: Record<string, string> = {
  WhatsApp: 'whatsapp',
  Email: 'email',
  Letter: 'letter',
  'Feedback form': 'feedbackForm',
  Brochure: 'brochure',
  'Google review': 'googleReview',
  LinkedIn: 'linkedin',
  Instagram: 'instagram',
  'In person': 'inPerson',
  Other: 'other',
}

const CONNECTION: Record<string, Connection | null> = {
  None: 'none',
  'Friend of Gaurang Mistry': 'friend',
  'Relative of Gaurang Mistry': 'relative',
  'Works with IIIC': 'worksWith',
  'Worked with IIIC': 'workedWith',
  'Not known yet': null,
}

/** The consent statuses that are a yes, with the name form each one chose. */
const CONSENT_YES: Record<string, DisplayForm | 'asShown'> = {
  'Yes, as shown': 'asShown',
  'Yes, initials only': 'initials',
  'Yes, full name': 'full',
}

const CONSENT_OTHER = ['Not asked yet', 'Asked, no reply yet', 'No']

/** What the import says about a row it cannot take, in VOICE.md's interface voice. */
export const INTAKE_MESSAGES = {
  headers: (missing: string[]) =>
    `The Reviews sheet is missing these columns: ${missing.join(', ')}. Use the intake template's columns.`,
  ref: 'Give the row a Ref, such as R-001.',
  fullName: 'Enter the person’s full name.',
  text: 'Paste the review in “The review, exactly as written”.',
  // The cell's value is never repeated: the report is a log, and a log holds no personal detail.
  value: (column: string) => `Choose ${column} from the sheet’s list.`,
  language:
    'The website shows reviews in English, Gujarati or Hindi. Record this one by hand once its language is added.',
  year: 'Enter the year as four digits, such as 2016.',
  date: (column: string) =>
    `Enter ${column} as a date the sheet stores as one, such as 1 Dec 2026.`,
  contact: 'Enter the contact as a phone number with its country code, or an email address.',
  consentFacts:
    'A yes needs its consent date and the file name of the saved reply (Consent evidence).',
  nameUnmatched: (shown: string) =>
    `The sheet’s “Name as it will appear” (${shown}) is not the full name, the first name and surname initial, or the initials: the review starts with initials; check the name before the consent request.`,
} as const

/** A cell as text, trimmed; null when it is empty. */
const cellText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  const text = String(value).trim()
  return text === '' ? null : text
}

/** A date cell: the sheet stores a typed date as one. ISO dates are taken as written. */
const DateCell = z.union([z.date(), z.iso.date().transform((value) => new Date(value))])

/** One row of the sheet, as the platform records it. */
export type IntakeRow = {
  /** The row's number in the sheet, for the report. */
  row: number
  ref: string
  person: {
    fullName: string
    email: string | null
    mobile: string | null
    ageBand: 'under18' | 'adult' | null
  }
  review: {
    displayForm: DisplayForm
    designation: string | null
    organisation: string | null
    showOrganisation: boolean
    place: string | null
    programme: string | null
    year: number | null
    doors: ReviewDoor[]
    text: string
    language: string
    translation: string | null
    source: string | null
    receivedOn: string | null
    originalReference: string | null
    connection: Connection | null
    screening: {
      result: ScreeningResult
      tests: Record<string, boolean>
      reason: string | null
    }
    photoAgreed: boolean
    profileLink: string | null
    profileLinkAgreed: boolean
    notes: string | null
  }
  /** The person's yes, with its evidence; null when the sheet records no yes. */
  consent: { grantedAt: string; evidence: string } | null
}

export type IntakeProblem = { row: number; ref: string | null; messages: string[] }

export type IntakeParse = {
  rows: IntakeRow[]
  problems: IntakeProblem[]
  /** Rows left alone: the template's example, and rows with nothing in them. */
  skipped: number
}

/** Whether a row is the template's example row, which the template asks to delete. */
function isExample(ref: string | null, notes: string | null): boolean {
  return /example/i.test(ref ?? '') || /^example row/i.test(notes ?? '')
}

/**
 * Reads the Reviews sheet's rows, the first being its headers. Each row is taken whole or not at
 * all: a row with a problem is reported with every problem it has, and nothing of it is
 * recorded, so it can be fixed in the sheet and the import run again.
 */
export function parseIntakeRows(data: readonly (readonly unknown[])[]): IntakeParse {
  const [header = [], ...body] = data
  const index = new Map(header.map((title, at) => [cellText(title) ?? '', at]))
  const missing = Object.values(COLUMNS).filter((title) => !index.has(title))
  if (missing.length) {
    return {
      rows: [],
      problems: [{ row: 1, ref: null, messages: [INTAKE_MESSAGES.headers(missing)] }],
      skipped: 0,
    }
  }
  const result: IntakeParse = { rows: [], problems: [], skipped: 0 }
  body.forEach((cells, at) => {
    const row = at + 2
    const raw = (column: Column) => cells[index.get(COLUMNS[column])!]
    const get = (column: Column) => cellText(raw(column))
    if (Object.keys(COLUMNS).every((column) => get(column as Column) === null)) {
      result.skipped += 1
      return
    }
    if (isExample(get('ref'), get('notes'))) {
      result.skipped += 1
      return
    }
    const messages: string[] = []
    const choose = <T>(column: Column, choices: Record<string, T>, empty: T): T => {
      const value = get(column)
      if (value === null) return empty
      if (value in choices) return choices[value]!
      messages.push(INTAKE_MESSAGES.value(COLUMNS[column]))
      return empty
    }
    const date = (column: Column): string | null => {
      const value = raw(column)
      if (value === null || value === undefined || cellText(value) === null) return null
      const parsed = DateCell.safeParse(value)
      if (parsed.success) return parsed.data.toISOString()
      messages.push(INTAKE_MESSAGES.date(COLUMNS[column]))
      return null
    }

    const ref = get('ref')
    if (!ref) messages.push(INTAKE_MESSAGES.ref)
    const fullName = get('fullName')
    if (!fullName) messages.push(INTAKE_MESSAGES.fullName)
    const text = get('text')
    if (!text) messages.push(INTAKE_MESSAGES.text)

    const languageName = get('language')
    let language = 'en-IN'
    if (languageName !== null) {
      if (languageName in LANGUAGE) language = LANGUAGE[languageName]!
      else messages.push(INTAKE_MESSAGES.language)
    }

    const yearCell = raw('year')
    let year: number | null = null
    if (cellText(yearCell) !== null) {
      const parsed = z.coerce.number().int().min(1980).max(2100).safeParse(yearCell)
      if (parsed.success) year = parsed.data
      else messages.push(INTAKE_MESSAGES.year)
    }

    const contact = get('contact')
    let email: string | null = null
    let mobile: string | null = null
    if (contact !== null) {
      const asEmail = z.email().safeParse(contact)
      if (asEmail.success) email = asEmail.data.toLowerCase()
      else mobile = toE164(contact)
      if (!email && !mobile) messages.push(INTAKE_MESSAGES.contact)
    }

    const doors = choose('area', AREA, [] as ReviewDoor[])
    const result_ = choose('screening', SCREENING, 'notScreened' as ScreeningResult)
    const connection = choose('connection', CONNECTION, null as Connection | null)
    const source = choose('source', SOURCE, null as string | null)
    const ageBand = choose('under18', { Yes: 'under18', No: 'adult' } as const, null)
    const showOrganisation = choose('showOrganisation', { Yes: true, No: false }, false)
    const photo = choose(
      'photo',
      { 'No photo': false, 'Photo, agreed': true, 'Photo, not agreed': false },
      false,
    )
    const consentStatus = get('consentStatus')
    let chosen: DisplayForm | 'asShown' | null = null
    if (consentStatus !== null) {
      if (consentStatus in CONSENT_YES) chosen = CONSENT_YES[consentStatus]!
      else if (!CONSENT_OTHER.includes(consentStatus)) {
        messages.push(INTAKE_MESSAGES.value(COLUMNS.consentStatus))
      }
    }
    const receivedOn = date('receivedOn')
    const grantedAt = date('consentDate')
    const evidence = get('consentEvidence')
    if (chosen !== null && (!grantedAt || !evidence)) messages.push(INTAKE_MESSAGES.consentFacts)

    const notes = [get('notes'), get('changes')].filter(Boolean) as string[]
    const nameAsShown = get('nameAsShown')
    let displayForm: DisplayForm = defaultDisplayForm(doors)
    if (chosen === 'initials' || chosen === 'full') displayForm = chosen
    else if (nameAsShown && fullName) {
      const form = formOfName(fullName, nameAsShown)
      if (form) displayForm = form
      else {
        displayForm = 'initials'
        notes.push(INTAKE_MESSAGES.nameUnmatched(nameAsShown))
      }
    }
    // Screening test 6: for anyone under 18, the card shows initials only.
    if (ageBand === 'under18') displayForm = 'initials'

    if (messages.length || !ref || !fullName || !text) {
      result.problems.push({ row, ref, messages })
      return
    }
    const linkedin = get('linkedin')
    result.rows.push({
      row,
      ref,
      person: { fullName, email, mobile, ageBand },
      review: {
        displayForm,
        designation: get('designation'),
        organisation: get('organisation'),
        showOrganisation,
        place: get('place'),
        programme: get('programme'),
        year,
        doors,
        text,
        language,
        translation: get('translation'),
        source,
        receivedOn,
        originalReference: get('original'),
        connection,
        screening: {
          result: result_,
          // "Passes" in the sheet means every one of the eight tests passed (its How to fill).
          tests: Object.fromEntries(
            SCREENING_TESTS.map(({ name }) => [name, result_ === 'passes']),
          ),
          reason: get('screeningNote'),
        },
        photoAgreed: photo,
        // The column is filled only when the person agreed to the link.
        profileLink: linkedin,
        profileLinkAgreed: linkedin !== null,
        notes: notes.length ? notes.join('\n') : null,
      },
      consent: chosen !== null && grantedAt && evidence ? { grantedAt, evidence } : null,
    })
  })
  return result
}

/**
 * How a reply reached IIIC, for the consent entry: the consent request goes from IIIC's
 * WhatsApp Business number, or by email (review-consent-request.md), and the sheet keeps the
 * saved reply's file name, so an email file (.eml, .msg) is an email and anything else a
 * WhatsApp reply.
 */
export function replyChannel(evidence: string): 'email' | 'whatsapp' {
  return /\.(?:eml|msg)$/i.test(evidence.trim()) ? 'email' : 'whatsapp'
}
