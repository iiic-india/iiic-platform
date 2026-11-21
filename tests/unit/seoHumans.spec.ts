// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { GET, maxDuration, runtime } from '@/app/humans.txt/route'
import { SITE_NAME } from '@/lib/seo/site'

// /humans.txt (src/app/humans.txt/route.ts; docs/11 §5.5): who made the site, the kit's
// typefaces with their licences, and the signature line with its translation (D-36).
const body = () => GET().text()

describe('the route /humans.txt', () => {
  it('answers as plain text, cached at the edge for a day (docs/12 §1)', async () => {
    const response = GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
    )
    expect((await response.text()).endsWith('\n')).toBe(true)
  })

  it('declares its runtime and time limit (docs/12 §6)', () => {
    expect(runtime).toBe('nodejs')
    expect(maxDuration).toBe(10)
  })

  it('says who made the site, under the headings humans.txt uses', async () => {
    const lines = (await body()).split('\n')
    expect(lines.filter((line) => /^\/\* .+ \*\/$/.test(line))).toEqual([
      '/* TEAM */',
      '/* SITE */',
      '/* SIGNATURE */',
    ])
    expect(lines).toContain(`Site: ${SITE_NAME} (IIIC), Ahmedabad, India`)
    expect(lines).toContain('Built with: Claude Code')
    expect(lines).toContain('Language: en-IN')
  })

  it('names the kit’s typefaces and their licence as the kit’s own licence file does', async () => {
    const licence = readFileSync(join(process.cwd(), 'src/brand/LICENSE.md'), 'utf8')
    const text = await body()
    for (const fact of [
      'The Fraunces Project Authors',
      'The Manrope Project Authors',
      'SIL Open Font License 1.1',
    ]) {
      expect(licence, fact).toContain(fact)
      expect(text, fact).toContain(fact)
    }
  })

  it('carries the signature line as D-36 spells it, with its reading and its translation', async () => {
    const text = await body()
    expect(text).toContain('आत्मानं विद्धि (ātmānaṃ viddhi): Know thyself.')
    // The brochures' spelling, a typo, is not reproduced.
    expect(text).not.toContain('आत्मनं')
  })

  it('holds no placeholder, no person’s contact details and no claim', async () => {
    const text = await body()
    expect(text).not.toMatch(/\[\[|\]\]|TODO/)
    expect(text).not.toMatch(/@|\+91|\bDr\b/)
    expect(text).not.toMatch(/\b(?:best|leading|first|award\w*|recogni[sz]ed|accredit\w+)\b/i)
  })
})
