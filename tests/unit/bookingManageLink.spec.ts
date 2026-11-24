// @vitest-environment node
import type { PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { hashManageToken, MANAGE_TOKEN } from '@/lib/booking/tokens'

vi.mock('server-only', () => ({}))

const settings = vi.hoisted(() => ({
  PAYLOAD_SECRET: 'fake-secret-for-tests-only-000000000000000000',
  PAYLOAD_SECRET_PREVIOUS: undefined as string | undefined,
  siteUrl: 'https://example.invalid/',
}))
vi.mock('@/lib/env', () => ({ env: () => settings }))

const { derivedManageToken, manageUrlFor } = await import('@/emails/booking/manageLink')

// The manage link a booking's message carries (docs/06 B2, B7; docs/16 §12, E): a booking the
// office confirmed or moved has no token, so its message issues one, stored only as a hash; a
// retry gives the same link; a booking whose token the client already holds gets no link; an
// ended booking gets none. Fake records only.

type Row = { id: number; manageTokenHash: string | null }

function fakeReq(row: Row) {
  const update = vi.fn(async ({ data }: { data: { manageTokenHash: string } }) => {
    if (!row.manageTokenHash) row.manageTokenHash = data.manageTokenHash
    return { docs: [row], errors: [] }
  })
  const req = {
    payload: { findByID: vi.fn(async () => ({ ...row })), update },
  } as unknown as PayloadRequest
  return { req, update }
}

const NOW = new Date('2030-01-01T00:00:00.000Z')
const AHEAD = { id: 7, status: 'confirmed' as const, endsAt: '2030-01-04T10:15:00.000Z' }

beforeEach(() => {
  settings.PAYLOAD_SECRET_PREVIOUS = undefined
})

describe('the manage link in a booking’s message', () => {
  it('derives a token of the manage link’s shape, different per booking', () => {
    const token = derivedManageToken(settings.PAYLOAD_SECRET, 7)
    expect(token).toMatch(MANAGE_TOKEN)
    expect(derivedManageToken(settings.PAYLOAD_SECRET, 8)).not.toBe(token)
    expect(derivedManageToken(`${settings.PAYLOAD_SECRET}-other`, 7)).not.toBe(token)
  })

  it('issues one for a booking with none, stores only its hash, and gives the same link again', async () => {
    const row: Row = { id: 7, manageTokenHash: null }
    const { req, update } = fakeReq(row)
    const url = await manageUrlFor(req, AHEAD, NOW)
    const token = derivedManageToken(settings.PAYLOAD_SECRET, 7)
    expect(url).toBe(`https://example.invalid/b/${token}`)
    expect(row.manageTokenHash).toBe(hashManageToken(token))
    expect(JSON.stringify(update.mock.calls)).not.toContain(token)
    // A retry, or the email after WhatsApp: the same link, nothing written again.
    expect(await manageUrlFor(req, AHEAD, NOW)).toBe(url)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('gives no link when the client already holds the booking’s token', async () => {
    const row: Row = { id: 7, manageTokenHash: hashManageToken('B'.repeat(43)) }
    const { req, update } = fakeReq(row)
    expect(await manageUrlFor(req, AHEAD, NOW)).toBeNull()
    expect(update).not.toHaveBeenCalled()
    expect(row.manageTokenHash).toBe(hashManageToken('B'.repeat(43)))
  })

  it('gives no link once the booking has ended', async () => {
    const { req, update } = fakeReq({ id: 7, manageTokenHash: null })
    const ended = { ...AHEAD, endsAt: '2029-12-31T10:00:00.000Z' }
    expect(await manageUrlFor(req, ended, NOW)).toBeNull()
    expect(update).not.toHaveBeenCalled()
  })

  it('still opens a link issued under the previous secret while it is rotated', async () => {
    const previous = 'fake-previous-secret-for-tests-0000000000000000'
    const old = derivedManageToken(previous, 7)
    settings.PAYLOAD_SECRET_PREVIOUS = previous
    const { req } = fakeReq({ id: 7, manageTokenHash: hashManageToken(old) })
    expect(await manageUrlFor(req, AHEAD, NOW)).toBe(`https://example.invalid/b/${old}`)
  })
})
