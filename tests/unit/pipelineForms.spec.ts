// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  FORM_MESSAGES,
  PartnershipEnquiryInput,
  TeamMapRequestInput,
  UtmInput,
} from '@/lib/pipeline/forms'

// The public forms' boundary (docs/03 F5, F12; docs/17 §6). The values are obviously fake.
const TEAM_MAP = {
  company: '  Example Fake Pvt Ltd ',
  website: 'Example.test',
  teamSizeBand: 'from11to50',
  sector: 'Fake manufacturing',
  name: 'Test Person',
  role: 'Fake HR lead',
  email: ' Test.Person@Example.TEST ',
  mobile: '098765 43210',
  prompt: '',
  consent: 'yes',
  noticeVersion: '3',
}

const PARTNERSHIP = {
  institution: 'Fake University of Testing',
  name: 'Test Person',
  role: 'Fake dean',
  email: 'dean@fake-university.test',
  phone: '+44 20 7946 0958',
  nature: 'A fake workshop for testing.',
  consent: 'yes',
  noticeVersion: 1,
}

function messagesOf(result: {
  success: boolean
  error?: { issues: { path: PropertyKey[]; message: string }[] }
}) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]),
  )
}

describe('the Team Map request (docs/03 F5)', () => {
  it('takes a full request and stores it in one form: trimmed, small letters, E.164', () => {
    const result = TeamMapRequestInput.safeParse(TEAM_MAP)
    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      company: 'Example Fake Pvt Ltd',
      website: 'https://example.test',
      teamSizeBand: 'from11to50',
      sector: 'Fake manufacturing',
      name: 'Test Person',
      role: 'Fake HR lead',
      email: 'test.person@example.test',
      mobile: '+919876543210',
      consent: 'yes',
      noticeVersion: 3,
    })
  })

  it('refuses a request whose consent box was not ticked (CLAUDE.md #4, #9)', () => {
    for (const consent of [undefined, '', 'on', 'no', true]) {
      const result = TeamMapRequestInput.safeParse({ ...TEAM_MAP, consent })
      expect(result.success, String(consent)).toBe(false)
      expect(messagesOf(result).consent).toBe(FORM_MESSAGES.consent)
    }
  })

  it('refuses a request without the notice version the form showed', () => {
    for (const noticeVersion of [undefined, '', '0', '-1', 'abc', '1.5']) {
      expect(TeamMapRequestInput.safeParse({ ...TEAM_MAP, noticeVersion }).success).toBe(false)
    }
  })

  it('says what is missing, field by field', () => {
    const result = TeamMapRequestInput.safeParse({
      ...TEAM_MAP,
      company: '   ',
      sector: '',
      name: undefined,
      role: '',
      email: 'not an address',
      mobile: '123',
      teamSizeBand: 'huge',
    })
    expect(messagesOf(result)).toEqual({
      company: FORM_MESSAGES.company,
      sector: FORM_MESSAGES.sector,
      name: FORM_MESSAGES.name,
      role: FORM_MESSAGES.role,
      email: FORM_MESSAGES.email,
      mobile: FORM_MESSAGES.phone,
      teamSizeBand: FORM_MESSAGES.teamSize,
    })
  })

  it('keeps the website optional and refuses one that is not a web address', () => {
    expect(TeamMapRequestInput.safeParse({ ...TEAM_MAP, website: '' }).data?.website).toBe(
      undefined,
    )
    for (const website of ['javascript:alert(1)', 'ftp://example.test', 'localhost', 'a b']) {
      const result = TeamMapRequestInput.safeParse({ ...TEAM_MAP, website })
      expect(messagesOf(result).website, website).toBe(FORM_MESSAGES.website)
    }
  })

  it('refuses text longer than the record holds', () => {
    const result = TeamMapRequestInput.safeParse({ ...TEAM_MAP, prompt: 'x'.repeat(2001) })
    expect(messagesOf(result).prompt).toBe(FORM_MESSAGES.tooLong)
    expect(TeamMapRequestInput.safeParse({ ...TEAM_MAP, company: 'x'.repeat(201) }).success).toBe(
      false,
    )
  })

  it('keeps nothing the form does not ask for', () => {
    const result = TeamMapRequestInput.safeParse({ ...TEAM_MAP, role_admin: 'owner', stage: 'won' })
    expect(result.success).toBe(true)
    expect(Object.keys(result.data ?? {})).not.toContain('stage')
  })
})

describe('the partnership enquiry (docs/03 F12)', () => {
  it('takes a full enquiry, with a number from outside India in E.164', () => {
    const result = PartnershipEnquiryInput.safeParse(PARTNERSHIP)
    expect(result.success).toBe(true)
    expect(result.data?.phone).toBe('+442079460958')
  })

  it('needs the nature of the enquiry and a ticked consent', () => {
    const result = PartnershipEnquiryInput.safeParse({ ...PARTNERSHIP, nature: ' ', consent: '' })
    expect(messagesOf(result)).toEqual({
      nature: FORM_MESSAGES.nature,
      consent: FORM_MESSAGES.consent,
    })
  })
})

describe('the campaign tags', () => {
  it('keeps short tags and drops empty ones', () => {
    expect(UtmInput.parse({ source: 'linkedin', medium: '', campaign: '  ' })).toEqual({
      source: 'linkedin',
    })
  })
})
