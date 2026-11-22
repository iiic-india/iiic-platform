import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RenderBlocks } from '@/components/blocks/PageBlocks'
import { SiteFooter } from '@/components/site/SiteFooter'
import { LEGAL } from '@/content/starter/legal'
import {
  buildReport,
  codedPlaceholders,
  CODED_PLACEHOLDERS,
  FIXED_PLACEHOLDERS,
  placeholdersIn,
} from '@/lib/content/placeholders'
import {
  certInLine,
  footerLegal,
  grievanceOfficerLine,
  LEGAL_PLACEHOLDERS,
  legalRows,
  NO_LEGAL_INFORMATION,
  toLegalInformation,
  type LegalInformation,
} from '@/lib/settings/legal'
import { CONTACT } from '@/lib/site/contact'

// The legal information the footer and /legal print, from the settings (docs/04 `settings`;
// docs/08 §3, §4): each detail the owner's value, or its placeholder while it is empty, and the
// placeholders report listing exactly what the site still draws (D-56). Obviously fake details;
// the phone number is libphonenumber's own example.
vi.mock('next/image', () => ({ default: () => null }))

afterEach(cleanup)

/** The settings global as Payload reads it back, every legal detail filled in. */
const SAVED = {
  legal: {
    legalName: '  Fake Proprietor Name  ',
    tradeName: 'Fake Trade Name',
    address: 'Fake building, fake street\nFake City 000000',
    gstin: '24AAAAA0000A1Z5',
    gstStatus: null,
    udyam: 'UDYAM-GJ-00-0000000',
    customerCare: { email: null, phone: null, hours: null },
    grievanceOfficer: {
      name: 'Fake Officer',
      designation: 'Fake Designation',
      email: 'grievance.fake@example.invalid',
      phone: '+918123456789',
    },
    certIn: { name: 'Fake Contact', email: 'certin.fake@example.invalid', phone: '+918123456789' },
  },
  bank: { accountNumber: '000000000000' },
  darkPatternAudits: [
    { auditedOn: '2027-01-05T06:30:00.000Z', certificate: null },
    {
      auditedOn: '2028-01-04T06:30:00.000Z',
      certificate: { id: 9, url: '/api/media/file/fake-certificate.webp' },
    },
  ],
}

const FILLED: LegalInformation = toLegalInformation(SAVED)

const chips = (container: HTMLElement) =>
  [...container.querySelectorAll('.iiic-todo')]
    .map((chip) => `${chip.getAttribute('data-todo')}|${chip.textContent}`)
    .sort()

const asChips = (placeholders: { id: string; what: string }[]) =>
  placeholders.map(({ id, what }) => `${id}|[[TODO: ${what}, ${id}]]`).sort()

describe('reading the settings', () => {
  it('takes the legal details, trimmed, and nothing else: no bank details, no auditors', () => {
    expect(FILLED.legalName).toBe('Fake Proprietor Name')
    expect(FILLED.customerCare).toEqual({})
    expect(JSON.stringify(FILLED)).not.toContain('000000000000')
    expect(FILLED).not.toHaveProperty('udyam')
    // The latest audit, with its certificate's address.
    expect(FILLED.darkPatternAudit).toEqual({
      auditedOn: '2028-01-04T06:30:00.000Z',
      certificateUrl: '/api/media/file/fake-certificate.webp',
    })
  })

  it('reads a global nobody has saved, or anything else, as no legal information at all', () => {
    for (const settings of [undefined, null, {}, { legal: null }, 'fake', 7]) {
      expect(toLegalInformation(settings), String(settings)).toEqual(NO_LEGAL_INFORMATION)
    }
    expect(toLegalInformation({ legal: { legalName: '   ' } }).legalName).toBeUndefined()
    expect(
      toLegalInformation({ darkPatternAudits: [{ auditedOn: 'not a date' }] }).darkPatternAudit,
    ).toBeUndefined()
  })
})

describe('the details as the site prints them', () => {
  it('names the grievance officer only once the name, designation and a way to reach them are there', () => {
    expect(grievanceOfficerLine(FILLED)).toBe(
      'Fake Officer, Fake Designation, grievance.fake@example.invalid, +91 81234 56789',
    )
    const partly = (officer: LegalInformation['grievanceOfficer']) =>
      grievanceOfficerLine({ ...NO_LEGAL_INFORMATION, grievanceOfficer: officer })
    expect(partly({ name: 'Fake Officer', designation: 'Fake Designation' })).toBeNull()
    expect(partly({ name: 'Fake Officer', email: 'grievance.fake@example.invalid' })).toBeNull()
    expect(
      partly({ name: 'Fake Officer', designation: 'Fake Designation', phone: '+918123456789' }),
    ).toBe('Fake Officer, Fake Designation, +91 81234 56789')
  })

  it('names the CERT-In point of contact only with all three details', () => {
    expect(certInLine(FILLED)).toBe('Fake Contact, certin.fake@example.invalid, +91 81234 56789')
    expect(
      certInLine({ ...NO_LEGAL_INFORMATION, certIn: { name: 'Fake', email: 'f@example.invalid' } }),
    ).toBeNull()
  })

  it('shows the registration status only while there is no GSTIN', () => {
    expect(footerLegal({ ...NO_LEGAL_INFORMATION, gstStatus: 'Fake status' })).toMatchObject({
      gstin: null,
      gstStatus: 'Fake status',
    })
    expect(
      footerLegal({ ...NO_LEGAL_INFORMATION, gstin: '24AAAAA0000A1Z5', gstStatus: 'Fake' }),
    ).toMatchObject({ gstin: '24AAAAA0000A1Z5', gstStatus: null })
  })
})

describe('/legal’s table', () => {
  it('is today’s draft while the settings are empty: the known facts and every placeholder', () => {
    const rows = legalRows(NO_LEGAL_INFORMATION)
    expect(rows.map((row) => row.item)).toEqual([
      'Trade name',
      'Legal name',
      'Kind of business',
      'Address',
      'Website',
      'GSTIN',
      'Customer care',
      'Grievance officer',
      'CERT-In point of contact',
      'Dark-pattern self-audit',
    ])
    expect(rows[2]?.text).toBe('Sole proprietorship')
    expect(rows[4]?.text).toBe('imagecatalysts.in')
    expect(rows[6]?.text).toBe(`${CONTACT.email} or ${CONTACT.phone}, ${CONTACT.hours}`)
    expect(rows.every((row) => !row.link)).toBe(true)
  })

  it('prints what the owner entered, with no placeholder left', () => {
    const { container } = render(
      <RenderBlocks layout={LEGAL.layout} legalReview={LEGAL.legalReview} legal={FILLED} />,
    )
    const table = screen.getByRole('region', { name: 'Who runs this site' })
    const detail = (item: string) =>
      within(table).getByRole('rowheader', { name: item }).nextElementSibling?.textContent
    expect(detail('Trade name')).toBe('Fake Trade Name')
    expect(detail('Legal name')).toBe('Fake Proprietor Name')
    expect(detail('Address')).toBe('Fake building, fake street, Fake City 000000')
    expect(detail('GSTIN')).toBe('24AAAAA0000A1Z5')
    // Customer care left empty: the contact details the site already shows (D-31).
    expect(detail('Customer care')).toBe(`${CONTACT.email} or ${CONTACT.phone}, ${CONTACT.hours}`)
    expect(detail('CERT-In point of contact')).toBe(
      'Fake Contact, certin.fake@example.invalid, +91 81234 56789',
    )
    expect(detail('Dark-pattern self-audit')).toBe(
      'Audited on 4 January 2028 · Certificate of compliance',
    )
    expect(
      within(table).getByRole('link', { name: 'Certificate of compliance' }).getAttribute('href'),
    ).toBe('/api/media/file/fake-certificate.webp')
    expect(container.querySelector('#legal .iiic-todo')).toBeNull()
    // The page itself is still a draft for the lawyer (D-52).
    expect(container.querySelector('[data-draft="I-22"]')).not.toBeNull()
  })

  it('reports exactly the placeholders it draws, filled in or not', () => {
    const partly = { ...NO_LEGAL_INFORMATION, legalName: 'Fake Proprietor Name' }
    for (const legal of [NO_LEGAL_INFORMATION, partly, FILLED]) {
      const { container } = render(
        <RenderBlocks layout={LEGAL.layout} legalReview={LEGAL.legalReview} legal={legal} />,
      )
      expect(chips(container)).toEqual(asChips(placeholdersIn(LEGAL, legal)))
      cleanup()
    }
    expect(placeholdersIn(LEGAL, FILLED)).toEqual([])
    expect(placeholdersIn(LEGAL, partly).map((placeholder) => placeholder.id)).toEqual([
      'I-26',
      'I-33',
      'I-05',
      'I-21',
      'I-27',
      'I-22',
    ])
  })
})

describe('the footer’s legal row', () => {
  const legalRow = (legal?: LegalInformation) => {
    const { container } = render(<SiteFooter legal={legal} />)
    return container.querySelector('.iiic-footer-legal')?.firstElementChild as HTMLElement
  }

  it('names the proprietor, the GSTIN and the grievance officer once they are entered', () => {
    const row = legalRow(FILLED)
    expect(row.textContent?.replace(/^© \d{4} /, '')).toBe(
      [
        'Indian Institute of Image Catalysts',
        'Legal name: Fake Proprietor Name',
        'GSTIN 24AAAAA0000A1Z5',
        'Grievance officer: Fake Officer, Fake Designation, grievance.fake@example.invalid, +91 81234 56789',
        `[[TODO: ${FIXED_PLACEHOLDERS.footerAffiliation.what}, I-30]]`,
      ].join(' · '),
    )
    // The affiliation statement waits on the lawyer, not on the settings (D-20).
    expect(
      [...row.querySelectorAll('.iiic-todo')].map((chip) => chip.getAttribute('data-todo')),
    ).toEqual(['I-30'])
  })

  it('prints the registration status in place of a GSTIN while there is none', () => {
    const row = legalRow({ ...NO_LEGAL_INFORMATION, gstStatus: 'Fake registration status' })
    expect(row.textContent).toContain(' · Fake registration status · Grievance officer: ')
    expect(row.textContent).not.toContain('GSTIN')
  })

  it('is listed in the report exactly while it draws a placeholder', () => {
    for (const legal of [
      NO_LEGAL_INFORMATION,
      FILLED,
      { ...NO_LEGAL_INFORMATION, gstStatus: 'Fake registration status' },
      { ...NO_LEGAL_INFORMATION, grievanceOfficer: { name: 'Fake Officer' } },
    ]) {
      const drawn = [...legalRow(legal).querySelectorAll('.iiic-todo')].map(
        (chip) => `${chip.getAttribute('data-todo')}|${chip.textContent}`,
      )
      const listed = codedPlaceholders(legal).filter((row) => row.section === 'Footer')
      expect(drawn.sort()).toEqual(asChips(listed))
      cleanup()
    }
    expect(codedPlaceholders()).toEqual(CODED_PLACEHOLDERS)
  })

  it('drops out of the report once the settings supply it, with /legal’s rows', () => {
    const source = {
      page: { title: 'Legal information', path: '/legal', href: '/legal', inAdmin: false },
      content: LEGAL,
    }
    const empty = buildReport([source]).missing.map((row) => row.id)
    const filled = buildReport([source], codedPlaceholders(FILLED), FILLED).missing.map(
      (row) => row.id,
    )
    expect(empty).toEqual([
      'I-05',
      'I-05',
      'I-21',
      'I-21',
      'I-22',
      'I-26',
      'I-26',
      'I-26',
      'I-27',
      'I-30',
      'I-33',
      'I-41',
    ])
    // What no setting supplies: the affiliation statement and Find your path's line.
    expect(filled).toEqual(['I-30', 'I-41'])
  })

  it('uses the words /legal uses for the same facts', () => {
    expect(FIXED_PLACEHOLDERS.footerLegalName).toBe(LEGAL_PLACEHOLDERS.legalName)
    expect(FIXED_PLACEHOLDERS.footerGstin).toBe(LEGAL_PLACEHOLDERS.gstin)
    expect(FIXED_PLACEHOLDERS.footerGrievanceOfficer).toBe(LEGAL_PLACEHOLDERS.grievanceOfficer)
    expect(FIXED_PLACEHOLDERS.contactAddress).toBe(LEGAL_PLACEHOLDERS.address)
  })
})
