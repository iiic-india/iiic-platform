// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/.well-known/security.txt/route'
import { expiresAfter, SECURITY_TXT_PATH, securityTxt } from '@/lib/security/securityTxt'
import { CONTACT } from '@/lib/site/contact'

vi.mock('next/server', () => ({ connection: async () => undefined }))

// /.well-known/security.txt (RFC 9116; docs/11 §5.5; docs/12 §5): who to tell, in which
// language, and until when, generated so that it never expires.

const DAY = 24 * 60 * 60 * 1000

/** The file's fields, as a reader parses them (RFC 9116 §4). */
const fields = (text: string) =>
  text
    .split('\n')
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const colon = line.indexOf(': ')
      return [line.slice(0, colon), line.slice(colon + 2)] as const
    })

describe('security.txt', () => {
  const now = new Date('2026-11-22T15:30:00.000Z')
  const text = securityTxt(now)

  it('carries the fields RFC 9116 asks for, each once, and nothing it does not know', () => {
    expect(fields(text)).toEqual([
      ['Contact', `mailto:${CONTACT.email}`],
      ['Expires', '2027-11-22T00:00:00.000Z'],
      ['Preferred-Languages', 'en'],
      ['Canonical', 'https://imagecatalysts.in/.well-known/security.txt'],
    ])
    expect(text.endsWith('\n')).toBe(true)
  })

  it('reaches the address the site publishes until the platform’s own exist (I-02)', () => {
    expect(text).toContain(`Contact: mailto:${CONTACT.email}\n`)
    expect(text).not.toContain('[[')
  })

  it('expires a little under a year ahead, whatever the day it is served', () => {
    for (const iso of [
      '2026-11-22T00:00:00.000Z',
      '2026-11-22T23:59:59.999Z',
      '2028-02-29T12:00:00.000Z',
      '2027-12-31T18:30:00.000Z',
    ]) {
      const served = new Date(iso)
      const ahead = expiresAfter(served).getTime() - served.getTime()
      expect(ahead, iso).toBeGreaterThan(364 * DAY)
      expect(ahead, iso).toBeLessThanOrEqual(365 * DAY)
    }
  })

  it('names its own address on the production domain, over https', () => {
    expect(SECURITY_TXT_PATH).toBe('/.well-known/security.txt')
    expect(text).toMatch(/^Canonical: https:\/\//m)
  })

  it('is served as UTF-8 plain text, generated per request and kept at the edge for a day', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
    )
    const served = fields(await response.text())
    const expires = new Date(served.find(([name]) => name === 'Expires')?.[1] ?? '')
    expect(expires.getTime()).toBeGreaterThan(Date.now() + 363 * DAY)
  })
})
