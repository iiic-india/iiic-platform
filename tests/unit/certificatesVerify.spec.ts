// @vitest-environment node
import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { formatCertificateId } from '@/lib/certificates/ids'
import { hashVerifyToken } from '@/lib/certificates/token'
import { makeVerify } from '@/lib/certificates/verify'
import { initials, verificationView, VERIFY_SELECT, type VerifyRow } from '@/lib/certificates/view'

vi.mock('server-only', () => ({}))

// The verify pages' answers (docs/18 §4): Valid, or Revoked with its day and a reissue's new ID;
// the full name by the QR token and initials by a typed ID; never the reason, a contact detail or
// the PDF; and nothing looked up for input that fails its own check. Every name is fake.

const id = formatCertificateId(2099, 1)
const replacement = formatCertificateId(2099, 2)
const token = 'AbCdEfGhIjKlMnOpQrStUv'

const row = (over: Partial<VerifyRow> = {}): VerifyRow => ({
  id: 1,
  certificateId: id,
  status: 'valid',
  nameAsPrinted: 'Example Learner',
  programmeName: 'Example Programme (fake)',
  programmeDetails: 'Example dates (fake)',
  completedOn: '2099-01-10',
  // 20:00 UTC is the next day in India.
  issuedAt: '2099-01-14T20:00:00.000Z',
  ...over,
})

/** A Payload that answers finds from fixed rows and records what it was asked. */
function fakePayload(rows: (VerifyRow & { verifyTokenHash?: string; replaces?: number })[]) {
  const find = vi.fn(async ({ where }: { where: Record<string, { equals: unknown }> }) => {
    const [[field, { equals }]] = Object.entries(where) as [[string, { equals: unknown }]]
    return {
      docs: rows.filter((candidate) => (candidate as Record<string, unknown>)[field] === equals),
    }
  })
  return { payload: { find } as unknown as Payload, find }
}

describe('what a verify page shows', () => {
  it('shows a valid certificate with its days in India, and no revocation', () => {
    expect(verificationView(row(), { by: 'token', replacedBy: null })).toEqual({
      found: true,
      certificateId: id,
      status: 'valid',
      name: 'Example Learner',
      programmeName: 'Example Programme (fake)',
      programmeDetails: 'Example dates (fake)',
      completedOn: '2099-01-10',
      issuedOn: '2099-01-15',
      revokedOn: null,
      replacedBy: null,
    })
  })

  it('shows a revoked one with the day it was revoked and, for a reissue, the new ID', () => {
    const view = verificationView(
      row({ status: 'revoked', revocation: { at: '2099-02-01T10:00:00.000Z' } }),
      { by: 'token', replacedBy: replacement },
    )
    expect(view).toMatchObject({
      status: 'revoked',
      revokedOn: '2099-02-01',
      replacedBy: replacement,
    })
  })

  it('shows the initials only for a typed ID', () => {
    expect(verificationView(row(), { by: 'id', replacedBy: null })).toMatchObject({ name: 'E. L.' })
    expect(initials('  example  learner-name ')).toBe('E. L. N.')
  })

  it('never reads the reason, the person, the token or the PDF', () => {
    expect(Object.keys(VERIFY_SELECT).sort()).toEqual(
      [
        'certificateId',
        'completedOn',
        'issuedAt',
        'nameAsPrinted',
        'programmeDetails',
        'programmeName',
        'revocation',
        'status',
      ].sort(),
    )
    expect(VERIFY_SELECT.revocation).toEqual({ at: true })
  })

  it('answers "not found" for nothing', () => {
    expect(verificationView(null, { by: 'id', replacedBy: null })).toEqual({ found: false })
  })
})

describe('the public lookups', () => {
  it('finds by the token’s hash, never by the token itself', async () => {
    const { payload, find } = fakePayload([{ ...row(), verifyTokenHash: hashVerifyToken(token) }])
    const view = await makeVerify(async () => payload).verifyByToken(token)
    expect(view).toMatchObject({ found: true, name: 'Example Learner' })
    expect(JSON.stringify(find.mock.calls)).not.toContain(token)
  })

  it('names the new ID on a reissued certificate’s page', async () => {
    const { payload } = fakePayload([
      {
        ...row({ status: 'revoked', revocation: { at: '2099-02-01T10:00:00.000Z' } }),
        verifyTokenHash: hashVerifyToken(token),
      },
      { ...row({ id: 2, certificateId: replacement }), replaces: 1 },
    ])
    const view = await makeVerify(async () => payload).verifyByToken(token)
    expect(view).toMatchObject({ status: 'revoked', replacedBy: replacement })
  })

  it('takes a typed ID in any case with spaces, and shows initials', async () => {
    const { payload } = fakePayload([row()])
    const view = await makeVerify(async () => payload).verifyById(`  ${id.toLowerCase()} `)
    expect(view).toMatchObject({ found: true, certificateId: id, name: 'E. L.' })
  })

  it('looks nothing up for a wrong check digit or a malformed token', async () => {
    const { payload, find } = fakePayload([row()])
    const verify = makeVerify(async () => payload)
    expect(await verify.verifyById('IIIC-C-2099-0001-0')).toEqual({ found: false })
    expect(await verify.verifyByToken('short')).toEqual({ found: false })
    expect(await verify.verifyByToken(`${token}x`)).toEqual({ found: false })
    expect(find).not.toHaveBeenCalled()
  })

  it('answers one plain "not found" for an unknown token', async () => {
    const { payload } = fakePayload([])
    expect(await makeVerify(async () => payload).verifyByToken(token)).toEqual({ found: false })
  })
})
