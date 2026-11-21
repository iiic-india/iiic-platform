// @vitest-environment node
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { starterAt } from '@/content/starter'
import { STEP_ZERO_CHOICES, STEP_ZERO_QUESTION } from '@/lib/map/stepZero'
import { APP_PAGES, MAP_PAGE } from '@/lib/seo/appPages'
import { isNoindexPath, pageSlugOf } from '@/lib/seo/paths'
import { canonicalPath, hasPlaceholder, SITE_NAME } from '@/lib/seo/site'

// The search title and description of the pages the app draws itself (src/lib/seo/appPages.ts),
// held to the rules the starter pages' are (D-65; tests/unit/starterPages.spec.ts).

/** Words a search title or description never uses (D-65). */
const FORBIDDEN =
  /\b(?:therap\w*|psychologist\w*|psychiatr\w*|clinical\w*|diagnos\w*|treatment\w*|degree\w*|diploma\w*|accredit\w*|recogni[sz]\w*|approved|best|top|leading|first|no\.\s?1|guarantee\w*|transform\w*)\b/i

describe('Find your path, in search', () => {
  it('keeps its own name as its title, and says in one line what it asks', () => {
    expect(MAP_PAGE.path).toBe('/map')
    expect(MAP_PAGE.title).toBe('Find your path')
    // The question the page asks and the three answers it offers (src/lib/map/stepZero.ts).
    const description = MAP_PAGE.description.toLowerCase()
    expect(description).toContain(STEP_ZERO_QUESTION.toLowerCase())
    for (const { label } of STEP_ZERO_CHOICES)
      expect(description, label).toContain(label.toLowerCase())
    // The institute's full name and its city (D-63).
    expect(MAP_PAGE.description).toContain(`${SITE_NAME} (IIIC), Ahmedabad`)
  })
})

describe.each(APP_PAGES.map((page) => [page.path, page] as const))(
  'the app’s own page %s',
  (path, page) => {
    it('is a page the app serves, not one the CMS or a starter file holds', () => {
      expect(canonicalPath(path)).toBe(path)
      expect(starterAt(pageSlugOf(path))).toBeUndefined()
      expect(isNoindexPath(path)).toBe(false)
      const route = join(process.cwd(), 'src/app/(platform)/(default)', path, 'page.tsx')
      expect(existsSync(route), route).toBe(true)
    })

    it('has a title and a description within their limits, with nothing made up (D-65)', () => {
      expect([...page.title].length, page.title).toBeGreaterThan(0)
      expect([...page.title].length, page.title).toBeLessThanOrEqual(53)
      expect([...page.description].length, page.description).toBeGreaterThan(0)
      expect([...page.description].length, page.description).toBeLessThanOrEqual(155)
      for (const text of [page.title, page.description]) {
        expect(hasPlaceholder(text), text).toBe(false)
        expect(text, text).not.toMatch(FORBIDDEN)
        expect(text, text).not.toMatch(/₹|\bRs\b|\bINR\b/)
      }
    })
  },
)

describe('the app’s own pages', () => {
  it('are Find your path alone, for now', () => {
    expect(APP_PAGES.map((page) => page.path)).toEqual(['/map'])
  })
})
