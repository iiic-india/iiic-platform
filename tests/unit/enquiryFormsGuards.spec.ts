// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  checkDrawn,
  MIN_FILL_MS,
  signDrawn,
  submitterHash,
  submitterHashesWithin,
} from '@/lib/enquiryForms/guards'
import { fakeRecentEnquiries, LIMITS } from '@/lib/enquiryForms/limits'
import { PAGE_PATH, registerOf } from '@/lib/enquiryForms/register'

// The guards every public form has (docs/17 §6): the signed time a form was drawn, and the
// submitter hash the rate limits count by. Obviously fake secrets and addresses.
const SECRET = 'test-only-secret-for-the-forms-0000000000000'
const OLD_SECRET = 'test-only-secret-it-replaced-0000000000000'
const ADDRESS = '203.0.113.7'
const AT = new Date('2026-11-23T06:30:00.000Z') // 12:00 in India
const later = (ms: number) => new Date(AT.getTime() + ms)

describe('the signed time a form is drawn at', () => {
  const drawn = signDrawn(SECRET, 'teamMap', AT)

  it('passes a form sent three seconds or more after it was drawn', () => {
    expect(checkDrawn(drawn, 'teamMap', later(MIN_FILL_MS), [SECRET])).toBe('ok')
    expect(checkDrawn(drawn, 'teamMap', later(60 * 60 * 1000), [SECRET])).toBe('ok')
  })

  it('marks a form sent sooner as a robot’s', () => {
    expect(MIN_FILL_MS).toBe(3_000)
    expect(checkDrawn(drawn, 'teamMap', later(MIN_FILL_MS - 1), [SECRET])).toBe('too-fast')
    expect(checkDrawn(drawn, 'teamMap', AT, [SECRET])).toBe('too-fast')
  })

  it('refuses a time nobody signed, one signed for the other form, or one from the future', () => {
    const [at, signature] = drawn.split('.')
    const now = later(10_000)
    expect(checkDrawn(undefined, 'teamMap', now, [SECRET])).toBe('unsigned')
    expect(checkDrawn('', 'teamMap', now, [SECRET])).toBe('unsigned')
    expect(checkDrawn(at, 'teamMap', now, [SECRET])).toBe('unsigned')
    // An earlier time under the same signature, to look slower than it was.
    expect(checkDrawn(`${Number(at) - 60_000}.${signature}`, 'teamMap', now, [SECRET])).toBe(
      'unsigned',
    )
    expect(checkDrawn(drawn, 'partnership', now, [SECRET])).toBe('unsigned')
    expect(checkDrawn(drawn, 'teamMap', now, ['test-only-another-secret-000000000000'])).toBe(
      'unsigned',
    )
    expect(checkDrawn(signDrawn(SECRET, 'teamMap', later(60_000)), 'teamMap', now, [SECRET])).toBe(
      'unsigned',
    )
  })

  it('still passes a form drawn under the secret being rotated out', () => {
    const before = signDrawn(OLD_SECRET, 'partnership', AT)
    expect(checkDrawn(before, 'partnership', later(5_000), [SECRET, OLD_SECRET])).toBe('ok')
  })
})

describe('the submitter hash', () => {
  it('is the same for one address through a day in India, and never holds the address', () => {
    const hash = submitterHash(SECRET, ADDRESS, AT)
    expect(hash).toMatch(/^[0-9a-f]{32}$/)
    expect(hash).not.toContain(ADDRESS)
    expect(submitterHash(SECRET, ADDRESS, later(60 * 60 * 1000))).toBe(hash)
  })

  it('differs by address, by day and by secret', () => {
    const hash = submitterHash(SECRET, ADDRESS, AT)
    expect(submitterHash(SECRET, '203.0.113.8', AT)).not.toBe(hash)
    expect(submitterHash(SECRET, ADDRESS, later(24 * 60 * 60 * 1000))).not.toBe(hash)
    expect(submitterHash(OLD_SECRET, ADDRESS, AT)).not.toBe(hash)
  })

  it('counts the last hour across midnight in India with both days’ hashes', () => {
    const afterMidnight = new Date('2026-11-23T18:40:00.000Z') // 00:10 on 24 November in India
    const hashes = submitterHashesWithin(SECRET, ADDRESS, afterMidnight, LIMITS.perAddress.windowMs)
    expect(hashes).toHaveLength(2)
    expect(hashes[0]).toBe(submitterHash(SECRET, ADDRESS, afterMidnight))
    expect(hashes).toContain(submitterHash(SECRET, ADDRESS, new Date('2026-11-23T18:00:00.000Z')))
    expect(submitterHashesWithin(SECRET, ADDRESS, AT, LIMITS.perAddress.windowMs)).toHaveLength(1)
  })
})

describe('the rate limits', () => {
  it('are five an hour from one address and three a day from one email address', () => {
    expect(LIMITS.perAddress).toEqual({ count: 5, windowMs: 60 * 60 * 1000 })
    expect(LIMITS.perEmail).toEqual({ count: 3, windowMs: 24 * 60 * 60 * 1000 })
  })

  it('count only what was stored since the moment asked', async () => {
    const recent = fakeRecentEnquiries([
      { submitterHash: 'a', email: 'fake@example.com', receivedAt: later(-30 * 60 * 1000) },
      { submitterHash: 'a', email: 'fake@example.com', receivedAt: later(-2 * 60 * 60 * 1000) },
      { submitterHash: 'b', email: 'other@example.com', receivedAt: later(-10 * 60 * 1000) },
    ])
    expect(await recent.fromSubmitter(['a'], later(-60 * 60 * 1000))).toBe(1)
    expect(await recent.fromSubmitter(['a', 'b'], later(-60 * 60 * 1000))).toBe(2)
    expect(await recent.fromEmail('fake@example.com', later(-24 * 60 * 60 * 1000))).toBe(2)
  })
})

describe('the register a form’s page is in', () => {
  it('follows the route groups, for the request_submitted event', () => {
    expect(registerOf('/organisations/team-map')).toBe('consultancy')
    expect(registerOf('/institute')).toBe('education')
    expect(registerOf('/institute/partnerships')).toBe('education')
    expect(registerOf('/about')).toBe('default')
    expect(registerOf('/')).toBe('default')
  })

  it('names a page by its path alone', () => {
    expect(PAGE_PATH.test('/organisations/team-map')).toBe(true)
    expect(PAGE_PATH.test('/institute?utm_source=fake')).toBe(false)
    expect(PAGE_PATH.test('https://fake.example/institute')).toBe(false)
    expect(PAGE_PATH.test('//fake')).toBe(false)
    expect(PAGE_PATH.test('/')).toBe(true)
  })
})
