import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import VerifyByTokenPage, {
  metadata as tokenMetadata,
} from '@/app/(platform)/(education)/institute/verify/[token]/page'
import VerifyByIdPage, { metadata } from '@/app/(platform)/(education)/institute/verify/page'
import type { VerificationView } from '@/lib/certificates/contract'
import { formatCertificateId } from '@/lib/certificates/ids'
import { CERTIFICATE_STATEMENT } from '@/lib/certificates/statement'
import { VERIFY_COPY } from '@/lib/certificates/verifyCopy'

const lookups = vi.hoisted(() => ({
  verifyById: vi.fn<(id: string) => Promise<VerificationView>>(),
  verifyByToken: vi.fn<(token: string) => Promise<VerificationView>>(),
}))
vi.mock('@/lib/certificates/wiring', () => lookups)
const budget = vi.hoisted(() => ({ takeLookUpById: vi.fn(() => true) }))
vi.mock('@/lib/certificates/lookupBudget', () => budget)

// The verify pages (docs/18 §4): never indexed; an ID in the wrong form or with a wrong check
// digit answered with the error summary and never looked up; Valid, or Revoked with its day and a
// reissue's new ID; initials by a typed ID; the fixed statement; one plain answer for an unknown
// ID or link. Every name is obviously fake.

const id = formatCertificateId(2099, 7)
const fresh = formatCertificateId(2099, 8)

const found = (
  over: Partial<Extract<VerificationView, { found: true }>> = {},
): VerificationView => ({
  found: true,
  certificateId: id,
  status: 'valid',
  name: 'Example Learner',
  programmeName: 'Example Programme (fake)',
  programmeDetails: 'Example batch (fake)',
  completedOn: '2099-03-30',
  issuedOn: '2099-04-02',
  revokedOn: null,
  replacedBy: null,
  ...over,
})

const byId = async (typed?: string) =>
  render(
    await VerifyByIdPage({
      searchParams: Promise.resolve(typed === undefined ? {} : { id: typed }),
    }),
  )
const byToken = async (token: string) =>
  render(await VerifyByTokenPage({ params: Promise.resolve({ token }) }))

beforeEach(() => {
  lookups.verifyById.mockReset()
  lookups.verifyByToken.mockReset()
  budget.takeLookUpById.mockReset().mockReturnValue(true)
})

afterEach(() => cleanup())

describe('the verify pages', () => {
  it('are never indexed', () => {
    for (const meta of [metadata, tokenMetadata]) {
      expect(meta.robots).toEqual({ index: false, follow: false })
      expect(meta.title).toBe(VERIFY_COPY.title)
    }
  })

  it('show the form alone, with its label and help, before anything is typed', async () => {
    await byId()
    expect(screen.getByLabelText(VERIFY_COPY.label).getAttribute('name')).toBe('id')
    expect(screen.getByText(VERIFY_COPY.help)).toBeTruthy()
    expect(lookups.verifyById).not.toHaveBeenCalled()
  })

  it('refuse an ID with a wrong check digit without looking it up', async () => {
    const wrong = id.replace(/\d$/, (digit) => String((Number(digit) + 1) % 10))
    await byId(wrong)
    expect(screen.getByRole('alert').textContent).toContain(VERIFY_COPY.idInvalid)
    expect(screen.getByLabelText(VERIFY_COPY.label).getAttribute('aria-invalid')).toBe('true')
    expect(lookups.verifyById).not.toHaveBeenCalled()
  })

  it('look nothing up by ID once the server’s lookups for the minute are spent', async () => {
    budget.takeLookUpById.mockReturnValue(false)
    await byId(id)
    expect(screen.getByRole('status').textContent).toBe(VERIFY_COPY.busy)
    expect(lookups.verifyById).not.toHaveBeenCalled()
    // A malformed ID is refused before the budget is touched.
    budget.takeLookUpById.mockClear()
    cleanup()
    await byId('IIIC-C-not-an-id')
    expect(budget.takeLookUpById).not.toHaveBeenCalled()
  })

  it('show a valid certificate by ID, with initials and the fixed statement', async () => {
    lookups.verifyById.mockResolvedValue(found({ name: 'E. L.' }))
    await byId(` ${id.toLowerCase()} `)
    expect(lookups.verifyById).toHaveBeenCalledWith(` ${id.toLowerCase()} `)
    expect(screen.getByRole('heading', { name: VERIFY_COPY.resultHeading(id) })).toBeTruthy()
    expect(screen.getAllByText(VERIFY_COPY.valid).length).toBeGreaterThan(0)
    expect(screen.getByText('E. L.')).toBeTruthy()
    expect(screen.getByText(VERIFY_COPY.initialsNote)).toBeTruthy()
    expect(screen.getByText('30 March 2099')).toBeTruthy()
    for (const sentence of CERTIFICATE_STATEMENT) expect(screen.getByText(sentence)).toBeTruthy()
  })

  it('show a revoked one with its day and the ID that replaced it', async () => {
    lookups.verifyByToken.mockResolvedValue(
      found({ status: 'revoked', revokedOn: '2099-04-05', replacedBy: fresh }),
    )
    await byToken('AbCdEfGhIjKlMnOpQrStUv')
    expect(screen.getAllByText(VERIFY_COPY.revoked).length).toBeGreaterThan(0)
    expect(screen.getByText(VERIFY_COPY.revokedNote('5 April 2099'), { exact: false })).toBeTruthy()
    expect(screen.getByText(fresh)).toBeTruthy()
    expect(
      screen.getByRole('link', { name: VERIFY_COPY.checkReplacement(fresh) }).getAttribute('href'),
    ).toBe(`/institute/verify?id=${encodeURIComponent(fresh)}`)
    // The full name by the QR token, and no initials note.
    expect(screen.getByText('Example Learner')).toBeTruthy()
    expect(screen.queryByText(VERIFY_COPY.initialsNote)).toBeNull()
  })

  it('answer an unknown ID or link with one plain answer', async () => {
    lookups.verifyById.mockResolvedValue({ found: false })
    await byId(id)
    expect(screen.getByRole('heading', { name: VERIFY_COPY.notFoundHeading })).toBeTruthy()
    expect(screen.getByText(VERIFY_COPY.notFoundById)).toBeTruthy()
    cleanup()
    lookups.verifyByToken.mockResolvedValue({ found: false })
    await byToken('not-a-token')
    expect(screen.getByText(VERIFY_COPY.notFoundByToken)).toBeTruthy()
    expect(screen.getByRole('link', { name: VERIFY_COPY.typeTheId }).getAttribute('href')).toBe(
      '/institute/verify',
    )
  })
})
