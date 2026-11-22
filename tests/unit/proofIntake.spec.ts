// @vitest-environment node
import { join } from 'node:path'

import { readSheet } from 'read-excel-file/node'
import { describe, expect, it } from 'vitest'

import {
  COLUMNS,
  INTAKE_MESSAGES,
  INTAKE_SHEET,
  parseIntakeRows,
  replyChannel,
} from '@/lib/proof/intake'

// The reviews intake sheet (docs/content/reviews-intake-template.xlsx; I-42), read into what the
// platform records. The template itself is read with the same reader the import uses; every row
// here is obviously fake.
const HEADERS = Object.values(COLUMNS)

/** A sheet row from the named cells; every other cell empty. */
function rowOf(cells: Partial<Record<keyof typeof COLUMNS, unknown>>): unknown[] {
  return HEADERS.map(
    (header) =>
      cells[
        (Object.keys(COLUMNS) as (keyof typeof COLUMNS)[]).find((key) => COLUMNS[key] === header)!
      ] ?? null,
  )
}

/** A fake row that passed screening and has the person's yes, with its evidence. */
const READY = {
  ref: 'R-901',
  fullName: 'Fakey Testperson',
  receivedOn: new Date('2026-11-01T00:00:00.000Z'),
  screening: 'Passes',
  nameAsShown: 'Fakey T.',
  designation: 'Fake Director',
  organisation: 'Fake Industries',
  showOrganisation: 'No',
  place: 'Fakepur',
  area: 'Consultancy',
  programme: 'Fake leadership programme',
  year: 2016,
  text: 'Fake review words, exactly as written.',
  language: 'English',
  source: 'WhatsApp',
  original: 'Reviews/Originals/R-901.jpg',
  connection: 'None',
  under18: 'No',
  consentStatus: 'Yes, as shown',
  consentDate: new Date('2026-11-10T00:00:00.000Z'),
  consentEvidence: 'Reviews/Consents/R-901.png',
  contact: '+91 90000 00001',
}

describe('reading the intake sheet', () => {
  it('reads the template’s own Reviews sheet with the import’s reader, and imports none of it', async () => {
    const data = await readSheet(
      join(process.cwd(), 'docs/content/reviews-intake-template.xlsx'),
      INTAKE_SHEET,
    )
    for (const header of HEADERS) expect(data[0], header).toContain(header)
    // Its one row is the example, which the template asks to delete.
    expect(parseIntakeRows(data)).toEqual({ rows: [], problems: [], skipped: 1 })
  })

  it('refuses a sheet without the template’s columns', () => {
    const parsed = parseIntakeRows([
      ['Ref', 'Full name'],
      ['R-1', 'Fake'],
    ])
    expect(parsed.rows).toEqual([])
    expect(parsed.problems[0]?.messages[0]).toMatch(/missing these columns/)
  })

  it('reads a ready row into the person, the review and the consent with its evidence', () => {
    const { rows, problems } = parseIntakeRows([HEADERS, rowOf(READY)])
    expect(problems).toEqual([])
    expect(rows).toHaveLength(1)
    const [row] = rows
    expect(row).toMatchObject({
      row: 2,
      ref: 'R-901',
      person: {
        fullName: 'Fakey Testperson',
        mobile: '+919000000001',
        email: null,
        ageBand: 'adult',
      },
      review: {
        displayForm: 'firstNameInitial',
        designation: 'Fake Director',
        organisation: 'Fake Industries',
        showOrganisation: false,
        place: 'Fakepur',
        programme: 'Fake leadership programme',
        year: 2016,
        doors: ['consultancy'],
        language: 'en-IN',
        source: 'whatsapp',
        receivedOn: '2026-11-01T00:00:00.000Z',
        originalReference: 'Reviews/Originals/R-901.jpg',
        connection: 'none',
        photoAgreed: false,
        profileLink: null,
        profileLinkAgreed: false,
      },
      consent: { grantedAt: '2026-11-10T00:00:00.000Z', evidence: 'Reviews/Consents/R-901.png' },
    })
    // "Passes" in the sheet means all eight tests passed.
    expect(Object.values(row!.review.screening.tests).every(Boolean)).toBe(true)
  })

  it('takes the name form the person chose in their reply, and initials for anyone under 18', () => {
    const parse = (cells: Partial<typeof READY>) =>
      parseIntakeRows([HEADERS, rowOf({ ...READY, ...cells })]).rows[0]?.review.displayForm
    expect(parse({ consentStatus: 'Yes, initials only' })).toBe('initials')
    expect(parse({ consentStatus: 'Yes, full name' })).toBe('full')
    expect(parse({ nameAsShown: 'F. T.' })).toBe('initials')
    expect(parse({ under18: 'Yes', consentStatus: 'Yes, full name' })).toBe('initials')
  })

  it('starts a counselling review with initials, and a name it cannot match with initials and a note', () => {
    const counselling = parseIntakeRows([
      HEADERS,
      rowOf({ ...READY, area: 'Counselling', nameAsShown: null, consentStatus: 'Not asked yet' }),
    ]).rows[0]
    expect(counselling?.review.displayForm).toBe('initials')
    expect(counselling?.consent).toBeNull()
    const unmatched = parseIntakeRows([HEADERS, rowOf({ ...READY, nameAsShown: 'Someone Else' })])
      .rows[0]
    expect(unmatched?.review.displayForm).toBe('initials')
    expect(unmatched?.review.notes).toBe(INTAKE_MESSAGES.nameUnmatched('Someone Else'))
  })

  it('refuses a row whole, with every problem it has, and never repeats a cell’s value', () => {
    const { rows, problems } = parseIntakeRows([
      HEADERS,
      rowOf({
        ...READY,
        text: null,
        area: 'Fake area',
        year: 'long ago',
        contact: 'not a contact',
        consentEvidence: null,
        language: 'Other',
      }),
    ])
    expect(rows).toEqual([])
    expect(problems).toEqual([
      {
        row: 2,
        ref: 'R-901',
        messages: expect.arrayContaining([
          INTAKE_MESSAGES.text,
          INTAKE_MESSAGES.language,
          INTAKE_MESSAGES.year,
          INTAKE_MESSAGES.contact,
          INTAKE_MESSAGES.value(COLUMNS.area),
          INTAKE_MESSAGES.consentFacts,
        ]),
      },
    ])
    expect(problems[0]!.messages.join(' ')).not.toMatch(/Fake area|long ago|not a contact/)
  })

  it('leaves empty rows and the example alone, and takes an email as the contact', () => {
    const { rows, skipped } = parseIntakeRows([
      HEADERS,
      rowOf({}),
      rowOf({ ...READY, ref: 'R-000 (example: delete this row)' }),
      rowOf({ ...READY, ref: 'R-902', contact: 'Fake.Person@Example.invalid' }),
    ])
    expect(skipped).toBe(2)
    expect(rows.map((row) => [row.ref, row.person.email])).toEqual([
      ['R-902', 'fake.person@example.invalid'],
    ])
  })

  it('records a reply as an email when its saved file is one, and as WhatsApp otherwise', () => {
    expect(replyChannel('Reviews/Consents/R-901.eml')).toBe('email')
    expect(replyChannel('reply.MSG')).toBe('email')
    expect(replyChannel('Reviews/Consents/R-901.png')).toBe('whatsapp')
  })
})
