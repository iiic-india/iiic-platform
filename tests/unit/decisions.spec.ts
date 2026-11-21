// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// The decision log overrides every other document (docs/README.md), and it is a table: a new
// decision goes in as the table's next row. The block under "How to record a decision" holds
// only the template, numbered one past the last decision. D-52 to D-56 were once written into
// that block, where they showed as code under the template instead of as decisions.
const read = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n')
const [table = '', howTo = ''] = read('docs/decisions.md').split('## How to record a decision')

const id = (n: number) => `D-${String(n).padStart(2, '0')}`

/** The template's number, which the next decision takes. */
function templateNumber(): number {
  const block = /```\n([\s\S]*?)```/.exec(howTo)?.[1]?.trim() ?? ''
  const lines = block.split('\n')
  expect(lines).toHaveLength(1)
  const template = /^\| D-(\d+) \| <the decision, in one sentence> \|/.exec(lines[0] ?? '')
  expect(template, lines[0]).not.toBeNull()
  return Number(template?.[1])
}

describe('the decision log', () => {
  it('keeps only the template in the block under "How to record a decision"', () => {
    expect(templateNumber()).toBeGreaterThan(1)
  })

  it('numbers the table’s decisions from D-01 to the one before the template, each once', () => {
    const n = templateNumber()
    const ids = [...table.matchAll(/^\| (D-\d+) \|/gm)].map(([, found]) => found)
    expect(ids.at(-1)).toBe(id(n - 1))
    expect(ids).toEqual(Array.from({ length: n - 1 }, (_, index) => id(index + 1)))
  })

  it('gives every decision a status and the milestone that needs it', () => {
    const rows = table.split('\n').filter((line) => line.startsWith('| D-'))
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      const cells = row.slice(2, -2).split(' | ')
      const name = row.slice(0, 8)
      expect(cells, name).toHaveLength(4)
      expect(cells[2], name).toMatch(/^(Decided|Recommended|Open)\b/)
    }
  })

  it('is listed in docs/README.md up to its last decision', () => {
    expect(read('docs/README.md')).toContain(`D-01 to ${id(templateNumber() - 1)} with status`)
  })
})
